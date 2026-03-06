-- 00064_seasonal_content_seeds.sql
-- Pre-load seasonal content snippets for social media posts
-- All editable/deletable from admin Content tab

INSERT INTO social_custom_content (content_type, text, active, start_date, end_date, platforms)
VALUES
  -- Spring (Mar-Apr)
  ('seasonal', 'Spring runoff season — water levels changing fast. Always check conditions before heading out.', true, '2026-03-01', '2026-04-30', ARRAY['instagram', 'facebook']),
  ('seasonal', 'Spring is prime time for Ozarks rivers. Wildflowers on the bluffs and perfect water temps.', true, '2026-03-15', '2026-04-30', ARRAY['instagram', 'facebook']),

  -- Late Spring / Early Summer (May-Jun)
  ('seasonal', 'Peak float season is here. Book shuttle services early for popular weekends.', true, '2026-05-01', '2026-06-30', ARRAY['instagram', 'facebook']),
  ('seasonal', 'Memorial Day weekend is the unofficial start of float season. Plan ahead for the best put-ins.', true, '2026-05-15', '2026-05-31', ARRAY['instagram', 'facebook']),

  -- Summer (Jul-Aug)
  ('seasonal', 'Beat the heat on the water. Pack extra water and sunscreen for summer floats.', true, '2026-07-01', '2026-08-31', ARRAY['instagram', 'facebook']),
  ('seasonal', 'Hot tip: weekday floats mean fewer crowds and better camping spots.', true, '2026-06-15', '2026-08-15', ARRAY['instagram', 'facebook']),

  -- Fall (Sep-Oct)
  ('seasonal', 'Fall foliage floats are peak Ozarks. Fewer crowds, cooler temps, beautiful colors.', true, '2026-09-01', '2026-10-31', ARRAY['instagram', 'facebook']),
  ('seasonal', 'The Ozarks in autumn — crisp air, golden canopy, and rivers all to yourself.', true, '2026-09-15', '2026-11-15', ARRAY['instagram', 'facebook']),

  -- Late Fall (Nov)
  ('seasonal', 'Late season floating can be magical. Dress in layers and enjoy the solitude.', true, '2026-11-01', '2026-11-30', ARRAY['instagram', 'facebook']),

  -- Winter / Off-season (Dec-Feb)
  ('seasonal', 'Off-season? Scout your next float. Save your favorite rivers at eddy.guide.', true, '2026-12-01', '2027-02-28', ARRAY['instagram', 'facebook']),
  ('seasonal', 'Winter is perfect for planning spring trips. Explore river maps and access points at eddy.guide.', true, '2026-12-15', '2027-02-15', ARRAY['instagram', 'facebook']),

  -- Year-round tip
  ('tip', 'Always check current conditions before heading to the river. Conditions can change fast in the Ozarks.', true, NULL, NULL, ARRAY['instagram', 'facebook'])
ON CONFLICT DO NOTHING;
