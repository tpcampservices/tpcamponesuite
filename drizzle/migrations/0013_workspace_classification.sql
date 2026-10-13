ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS workspace_type text NOT NULL DEFAULT 'customer';
UPDATE public.workspaces SET workspace_type='integration_test' WHERE id IN ('ea78ed53-5622-42ad-adcd-61bfd535d22e','5c9701fe-689b-49de-ba43-7ffb5fbac1f9','a34873d4-ee97-4253-b054-39a619229492','a1f15a8f-03e5-4a2c-9b0f-c28b2f7fbe11');
UPDATE public.workspaces SET workspace_type='internal' WHERE id = 'ae480761-9b55-4eea-a67a-fe0548638026';
UPDATE public.workspaces SET workspace_type='customer' WHERE id IN ('c06aaf5e-8213-4563-a2bc-11597e5b851d','a2cdbb6e-d677-4b74-8ec9-1ef8da5df05d');
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_type_check CHECK (workspace_type IN ('customer','managed_client','demo','internal','integration_test'));
COMMENT ON COLUMN public.workspaces.workspace_type IS 'Classification metadata only; never grants access, billing or permissions.';