-- Studio OS phase 0: freelancers are invited per project. The enum value is added on its own
-- because a new enum value can't be used in the same transaction that adds it.
alter type public.app_role add value if not exists 'freelancer';
