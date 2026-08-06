-- 20260725120400_create_content_tables.sql
-- Blog/content for the buying-guide SEO strategy.

create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content text not null,
  cover_image text,
  author_id uuid references admin_users(id) on delete set null,
  status blog_status not null default 'draft',
  published_at timestamptz,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_blog_posts_status on blog_posts(status);
create index idx_blog_posts_published_at on blog_posts(published_at);
create index idx_blog_posts_author_id on blog_posts(author_id);
