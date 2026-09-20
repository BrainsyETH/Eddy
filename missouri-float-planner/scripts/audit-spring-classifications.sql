-- Read-only candidate report, including inactive/off-water/orphan rows hidden
-- by the public POI API. Names are discovery hints, never automatic corrections.
select p.id, p.name, p.type, r.slug as river, p.active, p.is_on_water,
       p.latitude, p.longitude, p.nps_id, p.source, p.updated_at,
       case
         when p.type <> 'spring' then 'Spring in name; review classification'
         when p.river_id is null then 'Spring has no river association'
         when p.latitude is null or p.longitude is null then 'Spring has no position'
         when not p.active then 'Inactive spring; verify intentional'
         when not p.is_on_water then 'Off-water spring; verify intentional'
         else 'Review spring identity and duplicate records'
       end as review_reason
from points_of_interest p
left join rivers r on r.id = p.river_id
where p.type = 'spring' or p.name ~* '\msprings?\M'
order by r.slug nulls first, p.name;
