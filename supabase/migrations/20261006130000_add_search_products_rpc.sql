-- Public product search (Option B).
--
-- public.search_products() ranks the PUBLICLY VISIBLE catalog for a structured
-- search plan built by src/lib/catalog/searchTerms.ts and returns exactly one
-- row: the exact total number of matches plus the ids (and scores) of the
-- requested page, in rank order. The caller loads the normal list data for
-- those ids, so product cards, images and links keep using the existing code.
--
-- Security design:
--   * SECURITY INVOKER: runs as the caller (anon or authenticated), so the
--     existing row-level-security policies apply underneath.
--   * Visibility is also stated explicitly on every product read:
--     status = 'published' AND private.is_category_effectively_active(...).
--   * No dynamic SQL. The plan is bound jsonb, validated up front, and every
--     input is clamped. Matching uses position tests on normalized text, never
--     LIKE or regular expressions built from user text.
--   * Fixed search_path; every object is schema-qualified.
--   * Errors never echo input.
--
-- Nothing else is created or changed by this migration.

create function public.search_products(
  p_phrase text,
  p_units jsonb,
  p_category_id uuid default null,
  p_collection_id uuid default null,
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  total_count bigint,
  product_ids uuid[],
  relevances numeric[]
)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 60);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_phrase text;
  v_from text;
  v_to text;
begin
  -- Fixed accent map; the last three characters (straight, right and left
  -- single quotes) have no counterpart in v_to, so translate() deletes them.
  v_from := chr(224) || chr(225) || chr(226) || chr(227) || chr(228) || chr(229)
         || chr(231) || chr(232) || chr(233) || chr(234) || chr(235)
         || chr(236) || chr(237) || chr(238) || chr(239) || chr(241)
         || chr(242) || chr(243) || chr(244) || chr(245) || chr(246)
         || chr(249) || chr(250) || chr(251) || chr(252) || chr(253) || chr(255)
         || chr(39) || chr(8217) || chr(8216);
  v_to := 'aaaaaaceeeeiiiinooooouuuuyy';
  v_phrase := trim(regexp_replace(translate(lower(left(coalesce(p_phrase, ''), 100)), v_from, v_to), '[^a-z0-9]+', ' ', 'g'));

  -- ---------------------------------------------------------------------
  -- Payload validation. A malformed plan raises a fixed message.
  -- ---------------------------------------------------------------------
  if coalesce(case when jsonb_typeof(p_units) = 'array' then jsonb_array_length(p_units) else -1 end, -1) not between 1 and 8 then
    raise exception 'search_products: invalid units' using errcode = '22023';
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_units) e(v)
       where jsonb_typeof(e.v) is distinct from 'object'
          or coalesce(e.v ->> 'no', '') !~ '^[1-8]$'
          or coalesce(e.v ->> 'role', '') not in ('a', 'm')
          or jsonb_typeof(e.v -> 'alts') is distinct from 'array'
          or case when jsonb_typeof(e.v -> 'alts') = 'array' then jsonb_array_length(e.v -> 'alts') else -1 end not between 1 and 12
     )
     or (select count(distinct e.v ->> 'no') from jsonb_array_elements(p_units) e(v)) <> jsonb_array_length(p_units) then
    raise exception 'search_products: invalid units' using errcode = '22023';
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_units) e(v)
       cross join lateral jsonb_array_elements(e.v -> 'alts') a(v)
       where jsonb_typeof(a.v) is distinct from 'object'
          or coalesce(a.v ->> 'k', '') not in ('d', 'h', 'e')
          or jsonb_typeof(a.v -> 't') is distinct from 'string'
          or (a.v ->> 't') !~ '^[a-z0-9]+( [a-z0-9]+){0,2}$'
          or char_length(a.v ->> 't') > 60
     ) then
    raise exception 'search_products: invalid units' using errcode = '22023';
  end if;

  -- A gate may be absent or JSON null (both mean "not a gate"). Any other
  -- present value must be a well-formed gate object, otherwise fail closed.
  if exists (
       select 1
       from jsonb_array_elements(p_units) e(v)
       where (e.v -> 'gate') is not null
         and jsonb_typeof(e.v -> 'gate') is distinct from 'null'
         and (
              jsonb_typeof(e.v -> 'gate') is distinct from 'object'
              or coalesce(e.v ->> 'role', '') <> 'm'
              or jsonb_typeof(e.v -> 'gate' -> 'terms') is distinct from 'array'
              or case when jsonb_typeof(e.v -> 'gate' -> 'terms') = 'array' then jsonb_array_length(e.v -> 'gate' -> 'terms') else -1 end not between 1 and 12
              or (
                   (e.v -> 'gate' -> 'excl') is not null
                   and jsonb_typeof(e.v -> 'gate' -> 'excl') is distinct from 'null'
                   and (
                        jsonb_typeof(e.v -> 'gate' -> 'excl') is distinct from 'string'
                        or (e.v -> 'gate' ->> 'excl') !~ '^[a-z0-9]+( [a-z0-9]+){0,2}$'
                        or char_length(e.v -> 'gate' ->> 'excl') > 60
                   )
              )
         )
     ) then
    raise exception 'search_products: invalid units' using errcode = '22023';
  end if;

  if exists (
       select 1
       from jsonb_array_elements(p_units) e(v)
       cross join lateral jsonb_array_elements(e.v -> 'gate' -> 'terms') g(v)
       where jsonb_typeof(e.v -> 'gate') = 'object'
         and (
              jsonb_typeof(g.v) is distinct from 'string'
              or (g.v #>> '{}') !~ '^[a-z0-9]+( [a-z0-9]+){0,2}$'
              or char_length(g.v #>> '{}') > 60
         )
     ) then
    raise exception 'search_products: invalid units' using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------------
  -- Matching, qualification and ranking. Always returns exactly one row.
  -- ---------------------------------------------------------------------
  return query
  with
  params as (
    select 0.30 as strong_max,
           0.70 as boiler_min,
           0.10 as ignore_primary_below,
           0.50 as ignore_desc_min,
           0.50 as desc_points_max,
           0.25 as rescue_desc_max,
           4 as start_min_len
  ),
  q_units as (
    select cast(e.v ->> 'no' as integer) as unit_no,
           e.v ->> 'role' as role,
           coalesce(jsonb_typeof(e.v -> 'gate') = 'object', false) as is_gate,
           e.v as raw
    from jsonb_array_elements(p_units) e(v)
  ),
  alts as (
    select distinct
           qu.unit_no,
           qu.role,
           a.v ->> 'k' as kind,
           a.v ->> 't' as alt_text,
           string_to_array(a.v ->> 't', ' ') as words,
           cardinality(string_to_array(a.v ->> 't', ' ')) as n_words
    from q_units qu
    cross join lateral jsonb_array_elements(qu.raw -> 'alts') a(v)
  ),
  gate_terms as (
    select distinct
           qu.unit_no,
           g.t as term,
           nullif(qu.raw -> 'gate' ->> 'excl', '') as excl
    from q_units qu
    cross join lateral jsonb_array_elements_text(qu.raw -> 'gate' -> 'terms') g(t)
    where qu.is_gate
  ),
  vis as (
    select p.id,
           p.name as product_name,
           p.category_id,
           ' ' || trim(regexp_replace(translate(lower(coalesce(p.name, '')), v_from, v_to), '[^a-z0-9]+', ' ', 'g')) || ' ' as f_name,
           ' ' || trim(regexp_replace(translate(lower(coalesce(c.name, '')), v_from, v_to), '[^a-z0-9]+', ' ', 'g')) || ' ' as f_cat,
           ' ' || trim(regexp_replace(translate(lower(coalesce(p.base_material, '')), v_from, v_to), '[^a-z0-9]+', ' ', 'g')) || ' ' as f_mat,
           ' ' || trim(regexp_replace(translate(lower(coalesce(p.short_description, '')), v_from, v_to), '[^a-z0-9]+', ' ', 'g')) || ' ' as f_short,
           ' ' || trim(regexp_replace(translate(lower(coalesce(p.description, '')), v_from, v_to), '[^a-z0-9]+', ' ', 'g')) || ' ' as f_full
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.status = 'published'
      and private.is_category_effectively_active(p.category_id)
  ),
  word_hits as (
    select a.unit_no, a.role, a.kind, a.alt_text, a.n_words, b.id,
           count(*) filter (where strpos(b.f_name, ' ' || t.word || ' ') > 0) as name_whole,
           count(*) filter (where strpos(b.f_name, ' ' || t.word || ' ') > 0
                               or (char_length(t.word) >= p.start_min_len and strpos(b.f_name, ' ' || t.word) > 0)) as name_any,
           count(*) filter (where strpos(b.f_cat, ' ' || t.word || ' ') > 0) as cat_whole,
           count(*) filter (where strpos(b.f_cat, ' ' || t.word || ' ') > 0
                               or (char_length(t.word) >= p.start_min_len and strpos(b.f_cat, ' ' || t.word) > 0)) as cat_any,
           count(*) filter (where strpos(b.f_mat, ' ' || t.word || ' ') > 0) as mat_whole,
           count(*) filter (where strpos(b.f_mat, ' ' || t.word || ' ') > 0
                               or (char_length(t.word) >= p.start_min_len and strpos(b.f_mat, ' ' || t.word) > 0)) as mat_any,
           count(*) filter (where strpos(b.f_short, ' ' || t.word || ' ') > 0) as short_whole,
           count(*) filter (where strpos(b.f_short, ' ' || t.word || ' ') > 0
                               or (char_length(t.word) >= p.start_min_len and strpos(b.f_short, ' ' || t.word) > 0)) as short_any,
           count(*) filter (where strpos(b.f_full, ' ' || t.word || ' ') > 0) as full_whole,
           count(*) filter (where strpos(b.f_full, ' ' || t.word || ' ') > 0
                               or (char_length(t.word) >= p.start_min_len and strpos(b.f_full, ' ' || t.word) > 0)) as full_any
    from alts a
    cross join lateral unnest(a.words) as t(word)
    cross join vis b
    cross join params p
    group by a.unit_no, a.role, a.kind, a.alt_text, a.n_words, b.id
  ),
  alt_match as (
    select h.unit_no, h.role, h.kind, h.alt_text, h.id,
           case when h.name_whole = h.n_words then 1.0 when h.name_any = h.n_words then 0.8 else 0.0 end as q_name,
           case when h.cat_whole = h.n_words then 1.0 when h.cat_any = h.n_words then 0.8 else 0.0 end as q_cat,
           case when h.mat_whole = h.n_words then 1.0 when h.mat_any = h.n_words then 0.8 else 0.0 end as q_mat,
           case when h.short_whole = h.n_words then 1.0 when h.short_any = h.n_words then 0.8 else 0.0 end as q_short,
           case when h.full_whole = h.n_words then 1.0 when h.full_any = h.n_words then 0.8 else 0.0 end as q_full
    from word_hits h
  ),
  unit_stats as (
    select m.unit_no, max(m.role) as role,
           count(distinct m.id) filter (where m.q_name > 0) as n_name,
           count(distinct m.id) filter (where m.q_cat > 0) as n_cat,
           count(distinct m.id) filter (where m.q_mat > 0) as n_mat,
           count(distinct m.id) filter (where m.q_name > 0 or m.q_cat > 0 or m.q_mat > 0) as n_primary,
           count(distinct m.id) filter (where m.q_short > 0 or m.q_full > 0) as n_desc
    from alt_match m
    group by m.unit_no
  ),
  tot as (select greatest(count(*), 1) as n from vis),
  unit_class as (
    select s.unit_no, s.role, s.n_name, s.n_cat, s.n_mat, s.n_primary, s.n_desc, t.n,
           s.n_primary * 1.0 / t.n as df_primary,
           s.n_desc * 1.0 / t.n as df_desc,
           case
             when s.n_primary = 0 and s.n_desc = 0 then 'ignored'
             when s.n_primary = 0 and s.n_desc * 1.0 / t.n >= p.ignore_desc_min then 'ignored'
             when s.n_primary * 1.0 / t.n < p.ignore_primary_below and s.n_desc * 1.0 / t.n >= p.ignore_desc_min and s.role <> 'a' then 'ignored'
             when s.n_primary = 0 then 'secondary'
             when s.n_primary * 1.0 / t.n >= p.boiler_min then 'boilerplate'
             when s.n_primary * 1.0 / t.n >= p.strong_max then 'broad'
             else 'strong'
           end as class,
           (s.role = 'a' and s.n_name >= 1 and s.n_mat = 0) as anchored,
           (s.role = 'm' and qu.is_gate) as gate
    from unit_stats s
    join q_units qu on qu.unit_no = s.unit_no
    cross join tot t
    cross join params p
  ),
  imp as (
    select c.*,
           case c.class when 'strong' then 10 when 'broad' then 5 when 'secondary' then 2 when 'boilerplate' then 1 else 0 end as importance,
           case c.class when 'strong' then 1.0 when 'broad' then 0.5 when 'boilerplate' then 0.1 when 'secondary' then 1.0 else 0.0 end as class_factor
    from unit_class c
  ),
  alt_points as (
    select m.unit_no, m.kind, m.alt_text, m.id, f.field, f.rank_no,
           f.base_pts
             * (case m.kind when 'd' then 1.0 when 'h' then 0.85 else 0.6 end)
             * i.class_factor
             * (case i.role when 'a' then 1.0 else 0.5 end) as pts
    from alt_match m
    join imp i on i.unit_no = m.unit_no
    cross join params p
    cross join lateral (
      values
        ('name', 1, 100 * m.q_name),
        ('category', 2, 40 * m.q_cat),
        ('material', 3, 36 * m.q_mat),
        ('short', 4, case when i.class = 'strong' then 12 * m.q_short else 0.0 end),
        ('full', 5, case when i.class in ('strong', 'secondary') and i.df_desc <= p.desc_points_max then 4 * m.q_full else 0.0 end)
    ) as f(field, rank_no, base_pts)
  ),
  unit_best as (
    select distinct on (ap.unit_no, ap.id)
           ap.unit_no, ap.id, ap.field, ap.kind, ap.alt_text, ap.pts
    from alt_points ap
    where ap.pts > 0
    order by ap.unit_no, ap.id, ap.pts desc, ap.rank_no, ap.kind
  ),
  matches as (
    select ub.id,
           sum(case when ub.field in ('name', 'category', 'material') or i.n_primary = 0 then i.importance else 0 end) as matched_importance,
           sum(ub.pts) as unit_points,
           bool_or(i.class in ('strong', 'broad') and ub.field in ('name', 'category', 'material')) as ev_primary,
           bool_or(i.class = 'strong' and ub.field = 'short') as ev_short,
           bool_or(i.class = 'boilerplate' and ub.field in ('name', 'category', 'material')) as ev_boiler,
           bool_or(i.class in ('strong', 'secondary') and ub.field = 'full' and i.df_desc <= p.rescue_desc_max) as ev_rescue
    from unit_best ub
    join imp i on i.unit_no = ub.unit_no
    cross join params p
    group by ub.id
  ),
  query_state as (
    select count(*) filter (where i.class <> 'ignored') as n_active,
           count(*) filter (where i.class in ('strong', 'broad')) as n_strong_broad,
           count(*) filter (where i.anchored) as n_anchored,
           count(*) filter (where i.gate) as n_gate,
           coalesce(sum(i.importance), 0) as total_importance,
           coalesce(bool_or(i.role = 'a' and i.n_name = 0), false) as bad_type,
           coalesce(bool_or(i.role = 'm' and not i.gate and i.n_primary = 0), false) as has_unknown_mod
    from imp i
  ),
  q_flags as (
    select qs.*,
           (qs.bad_type or (qs.n_gate >= 1 and qs.n_anchored = 0 and qs.has_unknown_mod)) as force_zero
    from query_state qs
  ),
  anchor_hits as (
    select m.id, m.unit_no,
           min(case m.kind when 'd' then 1 when 'h' then 2 else 3 end) as tier
    from alt_match m
    join imp i on i.unit_no = m.unit_no
    where i.anchored and m.q_name > 0
    group by m.id, m.unit_no
  ),
  anchor_sum as (
    select a.id, count(*) as anchors_matched, max(a.tier) as tier
    from anchor_hits a
    group by a.id
  ),
  gate_hits as (
    select distinct gt.unit_no, v.id
    from gate_terms gt
    cross join vis v
    where not exists (select 1 from unnest(string_to_array(gt.term, ' ')) w where strpos(v.f_name, ' ' || w) = 0)
       or not exists (select 1 from unnest(string_to_array(gt.term, ' ')) w
                      where strpos(case when gt.excl is null then v.f_mat else replace(v.f_mat, ' ' || gt.excl || ' ', ' ') end, ' ' || w) = 0)
  ),
  gate_sum as (
    select g.id, count(*) as gates_met
    from gate_hits g
    group by g.id
  ),
  flags as (
    select m.id, m.unit_points, m.matched_importance, m.ev_rescue,
           qs.n_active, qs.n_anchored, qs.n_gate, qs.total_importance, qs.force_zero,
           coalesce(a.anchors_matched, 0) as anchors_matched,
           coalesce(a.tier, 1) as tier,
           (coalesce(gs.gates_met, 0) = qs.n_gate) as gate_ok,
           (5 * m.matched_importance >= 3 * qs.total_importance) as cov_ok,
           (m.ev_primary or m.ev_short or (m.ev_boiler and qs.n_strong_broad = 0)) as ev_main
    from matches m
    cross join q_flags qs
    left join anchor_sum a on a.id = m.id
    left join gate_sum gs on gs.id = m.id
  ),
  has_main as (
    select coalesce(bool_or(f.cov_ok and f.ev_main and f.gate_ok), false) as has_main
    from flags f
    where f.n_anchored = 0
  ),
  qualified as (
    select f.*
    from flags f
    cross join has_main h
    where not f.force_zero
      and f.n_active > 0
      and f.gate_ok
      and (
        (f.n_anchored > 0 and f.anchors_matched = f.n_anchored)
        or (f.n_anchored = 0 and f.cov_ok and (f.ev_main or ((not h.has_main) and f.ev_rescue)))
      )
  ),
  scored as (
    select q.id, b.product_name, b.category_id, q.tier,
           round(q.unit_points
                 + 60.0 * q.matched_importance / greatest(q.total_importance, 1)
                 + case when v_phrase = '' then 0
                        when trim(b.f_name) = v_phrase then 200
                        when left(trim(b.f_name), char_length(v_phrase) + 1) = v_phrase || ' ' then 80
                        when strpos(b.f_name, ' ' || v_phrase || ' ') > 0 then 50
                        else 0 end, 2) as score
    from qualified q
    join vis b on b.id = q.id
  ),
  filtered as (
    select s.*
    from scored s
    where (p_category_id is null or s.category_id = p_category_id)
      and (p_collection_id is null
           or exists (select 1 from public.product_collections pc
                      where pc.product_id = s.id and pc.collection_id = p_collection_id))
  ),
  ranked as (
    select f.id, f.score,
           row_number() over (order by f.tier, f.score desc, f.product_name, f.id) as rn
    from filtered f
  )
  select count(*) as total_count_all,
         coalesce(array_agg(r.id order by r.rn) filter (where r.rn > v_offset and r.rn <= v_offset + v_limit), cast('{}' as uuid[])) as page_ids,
         coalesce(array_agg(r.score order by r.rn) filter (where r.rn > v_offset and r.rn <= v_offset + v_limit), cast('{}' as numeric[])) as page_scores
  from ranked r;
end;
$fn$;

revoke all on function public.search_products(text, jsonb, uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.search_products(text, jsonb, uuid, uuid, integer, integer) to anon, authenticated;
