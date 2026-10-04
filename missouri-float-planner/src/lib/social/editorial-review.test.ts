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

test('editorial cover content survives centered square and portrait crops', async () => {
 const { coverGeometry } = await import('../og/social-cover');
 for (const size of [{width:1080,height:1920},{width:1080,height:1080}]) {
  const box=coverGeometry(size,'light','instagram',true);
  for (const aspect of size.height > size.width ? [1, 3/4, 4/5, 9/16] : [1]) {
   const visibleHeight=Math.min(size.height,size.width/aspect);
   const top=(size.height-visibleHeight)/2;
   assert.ok(box.top>=top);
   assert.ok(box.top+box.height<=top+visibleHeight);
  }
 }
});

test('continuous reading preserves every word and gives the full Read a relaxed pace', async () => {
 const { readingBlocks, readingDuration, READ_FPS } = await import('../../../shared/eddy-read-reel');
 const text='The water is steady. Check shallow crossings before choosing your route. '.repeat(15)+'\n\nFinish at the selected take-out.';
 assert.equal(readingBlocks(text).map(b=>b.text).join(' '),text.trim().replace(/\s+/g,' '));
 assert.ok(readingDuration(text)/READ_FPS>30);
 assert.ok(readingDuration(text)>readingDuration('Short reading.'));
 assert.ok(readingDuration(text.repeat(2))>readingDuration(text));
});
test('measured speech controls duration without cropping the closing narration', async () => {
 const { readingTiming, READ_VOICE_LEAD, READ_VOICE_GAP } = await import('../../../shared/eddy-read-reel');
 const voiceover={clips:[{src:'one.mp3',durationFrames:1000},{src:'two.mp3',durationFrames:400}],closing:{src:'end.mp3',durationFrames:140}};
 const timing=readingTiming('A short-looking but deliberately slow spoken report.',voiceover);
 assert.equal(timing.endingStart,READ_VOICE_LEAD+1400+READ_VOICE_GAP+12);
 assert.equal(timing.endingFrames,164);
 assert.equal(timing.duration,timing.endingStart+164);
});
test('Read weather shows the report date and its rain chance without borrowing another day', async () => {
 const { readingWeather } = await import('../../../shared/eddy-read-reel');
 const day={date:'2026-10-03',highF:74,lowF:58,condition:'Clouds',precipChance:13};
 const weather={forecast:[day,{...day,date:'2026-10-04',precipChance:90}]};
 assert.deepEqual(readingWeather(weather,'2026-10-04T01:00:00Z'),day);
 assert.equal(readingWeather(weather,'2026-10-05T18:00:00Z'),null);
 assert.equal(readingWeather(null,'2026-10-03T18:00:00Z'),null);
 assert.equal(readingWeather(weather,'invalid'),null);
});
test('full report is preserved without the separate introduction and stale prose stays withheld', async () => {
 const { publishableReading } = await import('../../../shared/eddy-read-reel');
 assert.equal(publishableReading({eddy_read:'Compact interpretation.',quote_text:'The complete report.'}),'The complete report.');
 assert.equal(publishableReading({eddy_read:'Stale interpretation.',quote_text:'',summary_text:null}),null);
 assert.equal(publishableReading({quote_text:'Legacy full report.'}),'Legacy full report.');
 assert.equal(publishableReading({quote_text:'  ',summary_text:'Available summary.'}),'Available summary.');
});
test('scroll starts with prose visible and brings the inline ending into place', async () => {
 const { readingScrollY, READ_CTA_FRAMES } = await import('../../../shared/eddy-read-reel');
 for (const height of [120, 1400, 5000]) {
   const positions = Array.from({length:900-READ_CTA_FRAMES},(_,frame)=>readingScrollY(frame,900,height));
   assert.equal(positions[0],24);
   assert.equal(positions.at(-1)!+height,24);
   assert.equal(readingScrollY(899,900,height),positions.at(-1));
   const step = positions[1]-positions[0];
   assert.ok(step<0);
   positions.slice(1).forEach((position,i)=>assert.ok(Math.abs(position-positions[i]-step)<1e-8));
 }
});
test('visual cues preserve decimal measurements and name topics without asserting a forecast', async () => {
 const { readingBlocks, readingTopic } = await import('../../../shared/eddy-read-reel');
 const text='The gauge is at 2.6 ft and 786 cfs. No rain is expected. Scout for strainers before launch.';
 assert.deepEqual(readingBlocks(text).map(b=>b.text),['The gauge is at 2.6 ft and 786 cfs.','No rain is expected.','Scout for strainers before launch.']);
 assert.deepEqual(readingBlocks(text).map(b=>b.topic),['water','weather','launch']);
 assert.equal(readingTopic('A quiet morning in October.'),null);
});
