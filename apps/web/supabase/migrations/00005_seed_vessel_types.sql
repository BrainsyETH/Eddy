-- File: supabase/migrations/00005_seed_vessel_types.sql
-- Seed data for vessel types

INSERT INTO vessel_types (name, slug, speed_low_water, speed_normal, speed_high_water, description, icon, sort_order) VALUES
    ('Raft', 'raft', 1.5, 2.0, 2.5, 'Multi-person inflatable raft. Slower but stable.', 'raft', 1),
    ('Canoe', 'canoe', 2.0, 2.5, 3.5, 'Traditional canoe. Good balance of speed and capacity.', 'canoe', 2),
    ('Kayak', 'kayak', 2.5, 3.0, 4.0, 'Single or tandem kayak. Fastest option.', 'kayak', 3),
    ('Tube', 'tube', 1.0, 1.5, 2.0, 'Inner tube. Leisurely pace, best for short floats.', 'tube', 4);
