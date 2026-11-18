import io
import json
import unittest
from unittest.mock import patch

from archive import fetch_site


class ArchiveTests(unittest.TestCase):
    def test_only_approved_unflagged_or_revised_only_days_are_archived(self):
        # Qualifier cells match the USGS daily CSV, including its quoted multi-flag list.
        response = io.BytesIO(b"""time,value,qualifier,approval_status,monitoring_location_id,parameter_code,statistic_id,unit_of_measure
2006-01-01,0,,Approved,USGS-07056000,00060,00003,ft^3/s
2006-01-02,123.5,['REVISED'],Approved,USGS-07056000,00060,00003,ft^3/s
2006-01-03,124,"['ESTIMATED', 'REVISED']",Approved,USGS-07056000,00060,00003,ft^3/s
2006-01-04,125,['ESTIMATED'],Approved,USGS-07056000,00060,00003,ft^3/s
2006-01-05,126,"['EQUIP', 'REVISED']",Approved,USGS-07056000,00060,00003,ft^3/s
2006-01-06,127,['REVISED'],Provisional,USGS-07056000,00060,00003,ft^3/s
2006-01-07,128,['ICE'],Approved,USGS-07056000,00060,00003,ft^3/s
""")
        response.headers = {}
        with patch("archive.urlopen", return_value=response):
            years = json.loads(fetch_site("07056000"))
        self.assertEqual(years[0][:7], [0, 123.5, None, None, None, None, None])
