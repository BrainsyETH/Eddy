-- supabase/seed/rivers.sql
-- Seed data for Missouri float rivers
-- 
-- This file contains the 8 MVP rivers for the Missouri Float Planner.
-- Geometry is simplified for initial import - can be refined with NHD data later.

-- Note: Run after migrations are applied

-- ============================================
-- MERAMEC RIVER
-- ============================================
INSERT INTO rivers (name, slug, geom, length_miles, description, difficulty_rating, region, nhd_feature_id, direction_verified)
VALUES (
    'Meramec River',
    'meramec',
    ST_GeomFromGeoJSON('{
        "type": "LineString",
        "coordinates": [
            [-91.4231, 37.8447],
            [-91.3856, 37.8612],
            [-91.3421, 37.8789],
            [-91.2987, 37.9023],
            [-91.2534, 37.9156],
            [-91.2012, 37.9289],
            [-91.1508, 37.9467],
            [-91.0987, 37.9634],
            [-91.0456, 37.9812],
            [-90.9923, 37.9978],
            [-90.9387, 38.0156],
            [-90.8856, 38.0334],
            [-90.8321, 38.0512],
            [-90.7789, 38.0689],
            [-90.7254, 38.0867],
            [-90.6723, 38.1045],
            [-90.6189, 38.1223],
            [-90.5697, 38.1401],
            [-90.5156, 38.1578],
            [-90.4623, 38.1756],
            [-90.4089, 38.1934],
            [-90.3556, 38.2112],
            [-90.3023, 38.2289],
            [-90.2489, 38.2467],
            [-90.1956, 38.2645],
            [-90.1423, 38.2823],
            [-90.0889, 38.3001],
            [-90.0356, 38.3178],
            [-89.9823, 38.3356],
            [-89.9289, 38.3534],
            [-89.8756, 38.3712],
            [-89.8223, 38.3889],
            [-89.7689, 38.4067],
            [-89.7156, 38.4245],
            [-89.6623, 38.4423],
            [-89.6089, 38.4601],
            [-89.5556, 38.4778],
            [-89.5023, 38.4956],
            [-89.4489, 38.5134],
            [-89.3956, 38.5312]
        ]
    }'),
    108.5,
    'Popular float stream in east-central Missouri, known for scenic bluffs, caves, and easy access. Flows through the Ozarks with numerous gravel bars and camping spots.',
    'Class I',
    'Ozarks',
    '9908874',
    false
) ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    difficulty_rating = EXCLUDED.difficulty_rating;

-- ============================================
-- CURRENT RIVER
-- ============================================
INSERT INTO rivers (name, slug, geom, length_miles, description, difficulty_rating, region, nhd_feature_id, direction_verified)
VALUES (
    'Current River',
    'current',
    ST_GeomFromGeoJSON('{
        "type": "LineString",
        "coordinates": [
            [-91.5234, 37.4123],
            [-91.4867, 37.3956],
            [-91.4501, 37.3789],
            [-91.4134, 37.3623],
            [-91.3767, 37.3456],
            [-91.3401, 37.3289],
            [-91.3034, 37.3123],
            [-91.2667, 37.2956],
            [-91.2301, 37.2789],
            [-91.1934, 37.2623],
            [-91.1567, 37.2456],
            [-91.1201, 37.2289],
            [-91.0834, 37.2123],
            [-91.0467, 37.1956],
            [-91.0150, 37.1789],
            [-90.9823, 37.1589],
            [-90.9489, 37.1389],
            [-90.9156, 37.1189],
            [-90.8823, 37.0989],
            [-90.8489, 37.0789],
            [-90.8239, 37.0534],
            [-90.8034, 37.0234],
            [-90.7823, 36.9934],
            [-90.7612, 36.9634],
            [-90.7401, 36.9334],
            [-90.7189, 36.9034],
            [-90.6978, 36.8734],
            [-90.6767, 36.8434],
            [-90.6556, 36.8134],
            [-90.6345, 36.7834],
            [-90.6134, 36.7534],
            [-90.5923, 36.7234],
            [-90.5712, 36.6934],
            [-90.5501, 36.6634]
        ]
    }'),
    134.2,
    'One of the first National Scenic Riverways, featuring crystal-clear spring-fed waters. The Current River is renowned for its blue-green color from numerous large springs including Big Spring.',
    'Class I-II',
    'Ozarks',
    '9949108',
    false
) ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    difficulty_rating = EXCLUDED.difficulty_rating;

-- ============================================
-- ELEVEN POINT RIVER
-- ============================================
INSERT INTO rivers (name, slug, geom, length_miles, description, difficulty_rating, region, nhd_feature_id, direction_verified)
VALUES (
    'Eleven Point River',
    'eleven-point',
    ST_GeomFromGeoJSON('{
        "type": "LineString",
        "coordinates": [
            [-91.5678, 36.8234],
            [-91.5312, 36.8089],
            [-91.4945, 36.7945],
            [-91.4578, 36.7801],
            [-91.4212, 36.7656],
            [-91.3845, 36.7512],
            [-91.3478, 36.7367],
            [-91.3112, 36.7223],
            [-91.2745, 36.7078],
            [-91.2378, 36.6934],
            [-91.2012, 36.6789],
            [-91.1645, 36.6645],
            [-91.1278, 36.6501],
            [-91.0912, 36.6356],
            [-91.0545, 36.6212],
            [-91.0178, 36.6067],
            [-90.9812, 36.5923],
            [-90.9445, 36.5778],
            [-90.9078, 36.5634],
            [-90.8712, 36.5489],
            [-90.8345, 36.5345],
            [-90.7978, 36.5201],
            [-90.7612, 36.5056],
            [-90.7245, 36.4912],
            [-90.6878, 36.4767]
        ]
    }'),
    96.8,
    'Wild and scenic river with remote float sections and abundant wildlife. Designated as a National Wild and Scenic River with exceptional water quality.',
    'Class I-II',
    'Ozarks',
    '9949356',
    false
) ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    difficulty_rating = EXCLUDED.difficulty_rating;

-- ============================================
-- JACKS FORK RIVER
-- ============================================
INSERT INTO rivers (name, slug, geom, length_miles, description, difficulty_rating, region, nhd_feature_id, direction_verified)
VALUES (
    'Jacks Fork River',
    'jacks-fork',
    ST_GeomFromGeoJSON('{
        "type": "LineString",
        "coordinates": [
            [-91.6234, 37.2567],
            [-91.5867, 37.2423],
            [-91.5501, 37.2278],
            [-91.5134, 37.2134],
            [-91.4767, 37.1989],
            [-91.4461, 37.1845],
            [-91.4134, 37.1701],
            [-91.3801, 37.1556],
            [-91.3467, 37.1412],
            [-91.3134, 37.1267],
            [-91.2801, 37.1123],
            [-91.2467, 37.0978],
            [-91.2134, 37.0834],
            [-91.1801, 37.0689],
            [-91.1467, 37.0545],
            [-91.1134, 37.0401],
            [-91.0801, 37.0256],
            [-91.0467, 37.0112],
            [-91.0134, 36.9967]
        ]
    }'),
    54.7,
    'Major tributary of the Current River, part of the Ozark National Scenic Riverways. Known for excellent swimming holes and the stunning Alley Spring mill.',
    'Class I-II',
    'Ozarks',
    '9949094',
    false
) ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    difficulty_rating = EXCLUDED.difficulty_rating;

-- ============================================
-- NIANGUA RIVER
-- ============================================
INSERT INTO rivers (name, slug, geom, length_miles, description, difficulty_rating, region, nhd_feature_id, direction_verified)
VALUES (
    'Niangua River',
    'niangua',
    ST_GeomFromGeoJSON('{
        "type": "LineString",
        "coordinates": [
            [-92.7234, 37.5123],
            [-92.6867, 37.4956],
            [-92.6501, 37.4789],
            [-92.6134, 37.4623],
            [-92.5767, 37.4456],
            [-92.5401, 37.4289],
            [-92.5017, 37.4123],
            [-92.4651, 37.3956],
            [-92.4284, 37.3789],
            [-92.3917, 37.3623],
            [-92.3551, 37.3456],
            [-92.3184, 37.3289],
            [-92.2817, 37.3123],
            [-92.2451, 37.2956],
            [-92.2084, 37.2789],
            [-92.1717, 37.2623],
            [-92.1351, 37.2456],
            [-92.0984, 37.2289],
            [-92.0617, 37.2123],
            [-92.0251, 37.1956],
            [-91.9884, 37.1789],
            [-91.9517, 37.1623],
            [-91.9151, 37.1456]
        ]
    }'),
    76.3,
    'Popular central Missouri float stream with moderate flow and scenic beauty. Features limestone bluffs and excellent smallmouth bass fishing.',
    'Class I',
    'Central Missouri',
    '9897586',
    false
) ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    difficulty_rating = EXCLUDED.difficulty_rating;

-- ============================================
-- BIG PINEY RIVER
-- ============================================
INSERT INTO rivers (name, slug, geom, length_miles, description, difficulty_rating, region, nhd_feature_id, direction_verified)
VALUES (
    'Big Piney River',
    'big-piney',
    ST_GeomFromGeoJSON('{
        "type": "LineString",
        "coordinates": [
            [-92.2567, 37.8234],
            [-92.2201, 37.8089],
            [-92.1834, 37.7945],
            [-92.1467, 37.7801],
            [-92.1101, 37.7656],
            [-92.0734, 37.7512],
            [-92.0347, 37.7367],
            [-91.9981, 37.7223],
            [-91.9614, 37.7078],
            [-91.9247, 37.6934],
            [-91.8881, 37.6789],
            [-91.8514, 37.6645],
            [-91.8147, 37.6501],
            [-91.7781, 37.6356],
            [-91.7414, 37.6212],
            [-91.7047, 37.6067],
            [-91.6681, 37.5923],
            [-91.6314, 37.5778],
            [-91.5947, 37.5634],
            [-91.5581, 37.5489],
            [-91.5214, 37.5345],
            [-91.4847, 37.5201]
        ]
    }'),
    68.4,
    'Clear Ozark stream with excellent smallmouth bass fishing. Known for scenic beauty and less crowded float sections.',
    'Class I-II',
    'Ozarks',
    '9897784',
    false
) ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    difficulty_rating = EXCLUDED.difficulty_rating;

-- ============================================
-- HUZZAH CREEK
-- ============================================
INSERT INTO rivers (name, slug, geom, length_miles, description, difficulty_rating, region, nhd_feature_id, direction_verified)
VALUES (
    'Huzzah Creek',
    'huzzah',
    ST_GeomFromGeoJSON('{
        "type": "LineString",
        "coordinates": [
            [-91.4234, 37.9123],
            [-91.3867, 37.9278],
            [-91.3501, 37.9434],
            [-91.3219, 37.9519],
            [-91.2867, 37.9634],
            [-91.2501, 37.9789],
            [-91.2134, 37.9945],
            [-91.1767, 38.0101],
            [-91.1401, 38.0256],
            [-91.1034, 38.0412],
            [-91.0667, 38.0567],
            [-91.0301, 38.0723],
            [-90.9934, 38.0878],
            [-90.9567, 38.1034],
            [-90.9201, 38.1189]
        ]
    }'),
    32.6,
    'Tributary of the Meramec, popular for shorter float trips. Crystal-clear water with numerous gravel bars ideal for swimming and camping.',
    'Class I',
    'Ozarks',
    '9908912',
    false
) ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    difficulty_rating = EXCLUDED.difficulty_rating;

-- ============================================
-- COURTOIS CREEK
-- ============================================
INSERT INTO rivers (name, slug, geom, length_miles, description, difficulty_rating, region, nhd_feature_id, direction_verified)
VALUES (
    'Courtois Creek',
    'courtois',
    ST_GeomFromGeoJSON('{
        "type": "LineString",
        "coordinates": [
            [-91.2234, 37.8567],
            [-91.1867, 37.8712],
            [-91.1501, 37.8856],
            [-91.0986, 37.9047],
            [-91.0534, 37.9189],
            [-91.0167, 37.9334],
            [-90.9801, 37.9478],
            [-90.9434, 37.9623],
            [-90.9067, 37.9767],
            [-90.8701, 37.9912],
            [-90.8334, 38.0056],
            [-90.7967, 38.0201],
            [-90.7601, 38.0345],
            [-90.7234, 38.0489]
        ]
    }'),
    28.3,
    'Beautiful Meramec tributary with clear water and gravel bars. Popular with kayakers for its narrower, more intimate character.',
    'Class I',
    'Ozarks',
    '9908934',
    false
) ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    difficulty_rating = EXCLUDED.difficulty_rating;

-- ============================================
-- UPDATE DOWNSTREAM POINTS
-- ============================================
-- Set downstream point to last coordinate of each river
UPDATE rivers SET downstream_point = ST_EndPoint(geom);
