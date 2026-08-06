-- Crazycraft REST/Supabase client use karta hai; GraphQL runtime use nahi hota.
-- Removing the unused extension closes the public GraphQL endpoint and removes
-- its object-exposure warnings.

drop extension if exists pg_graphql;