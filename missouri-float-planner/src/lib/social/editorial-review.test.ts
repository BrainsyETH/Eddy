import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestPages, shortSummary, splitTrendSeries, trendMeaning } from '../../../shared/social-editorial';
import { weekendWeather } from './weekend-weather';
import { savedPostMedia } from './review';

test('20 rivers remain present across four readable pages', () => {
 const rivers = Array.from({length:20}, (_,i)=>i);
 const pages = digestPages(rivers);
 assert.equal(pages.length,4); assert.deepEqual(pages.flat(),rivers);
 assert.ok(pages.every(p=>p.length<=5));
});
test('quotes fit a title card and retain the opening sentence', () => {
 assert.equal(shortSummary('Water is low. More detail follows.'),'Water is low.');
 assert.ok(shortSummary('A long report '.repeat(50)).length<=140);
});
test('falling high or low water is not promoted as better floating', () => {
 assert.match(trendMeaning('falling','high'),/still high/);
 assert.match(trendMeaning('falling','too_low'),/shallow/);
 assert.match(trendMeaning('falling','dangerous'),/Do not launch/);
});
test('trend breaks at explicit missing readings and long outages', () => {
 const point=(hoursAgo:number,gaugeHeightFt:number|null=2)=>({hoursAgo,gaugeHeightFt});
 assert.deepEqual(splitTrendSeries([point(-168),point(-167),point(-166,null),point(-165),point(-100)]).map(x=>x.length),[2,1,1]);
});
test('video retry retains media and rejects an absent render', () => {
 const post={caption:'Caption',media_type:'video',video_url:'https://test/video.mp4',image_url:'https://test/cover.jpg'};
 assert.deepEqual(savedPostMedia(post),{caption:'Caption',mediaType:'video',videoUrl:post.video_url,coverUrl:post.image_url});
 assert.throws(()=>savedPostMedia({...post,video_url:null}),/Render again/);
});
test('weekend weather requires both actual weekend dates', () => {
 const day=(date:string)=>({date,dayOfWeek:'Sat',highF:80,lowF:60,condition:'Clear',icon:'01d',precipChance:0});
 const weather={current:null,forecast:[day('2026-09-18')],todayPrecipChance:0,maxPrecipChance:0};
 const friday=new Date('2026-09-18T18:00:00Z');
 assert.equal(weekendWeather(weather,friday),null);
 assert.equal(weekendWeather({...weather,forecast:[day('2026-09-19')]},friday),null);
 const result=weekendWeather({...weather,forecast:[day('2026-09-19'),{...day('2026-09-20'),precipChance:75}]},friday);
 assert.equal(result?.maxPrecipChance,75); assert.match(result!.forecast[0].dayOfWeek,/Sat–Sun/);
 assert.equal(weekendWeather(null,friday),null);
});
