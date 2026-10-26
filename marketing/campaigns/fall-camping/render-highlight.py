"""Render the supplied camping footage with Eddy tokens and the generated voice.

Requires ffmpeg, ffprobe, Pillow and fontTools. No network or social publishing.
The edit timing is specific to the reviewed voice hash; mismatched takes fail.
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

p = argparse.ArgumentParser()
for flag in ('screen', 'scenery', 'voice-dir', 'theme', 'edit', 'output'):
    p.add_argument('--' + flag, type=Path, required=True)
p.add_argument('--brand-assets', type=Path)
a = p.parse_args()
repo = Path(__file__).resolve().parents[3]
fonts = a.brand_assets or repo/'missouri-float-planner/remotion/public/fonts'
mascot_path = (a.brand_assets/'eddy-campfire-chill.png') if a.brand_assets else repo/'missouri-float-planner/public/icons/eddy-campfire-chill.png'
theme = json.loads(a.theme.read_text())
edit = json.loads(a.edit.read_text())
review = json.loads((a.voice_dir / 'review.json').read_text())
normalize = lambda text: re.sub(r'[^a-z0-9]', '', text.lower())
alignment = json.loads((a.voice_dir / 'alignment.json').read_text())
assert normalize(alignment['text']) == normalize((a.voice_dir/'script.txt').read_text()), 'Review a narration/transcript mismatch before rendering.'
assert review['hash'] == edit['voiceHash'], 'Re-align the edit for this voice take.'
voice = a.voice_dir / 'narration.wav'
assert hashlib.sha256(voice.read_bytes()).hexdigest() == edit['voiceSha256'], 'Voice bytes changed.'
duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
    'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(voice)]))
assert edit['scenes'][0]['start'] == 0
assert all(x['end'] == y['start'] for x, y in zip(edit['scenes'], edit['scenes'][1:]))
assert edit['scenes'][-1]['end'] >= duration, 'Never truncate narration.'
safe = theme['safe']
left, top = safe['left'], safe['top']
right, bottom = 1080-safe['right'], 1920-safe['bottom']
width = right-left
surface = theme['surface']
card = theme['card']
boxes = []

def bounded(name, rect):
    x0,y0,x1,y1 = rect
    assert left <= x0 < x1 <= right and top <= y0 < y1 <= bottom, (name, rect)
    boxes.append({'name': name, 'bounds': rect})

with tempfile.TemporaryDirectory(prefix='eddy-camping-') as temp:
    work = Path(temp)
    geist = TTFont(fonts / 'GeistVF.woff')
    geist.flavor = None
    geist.save(work / 'Geist.ttf')
    def font(size, display=False):
        f = ImageFont.truetype(str(fonts / 'Fredoka-Variable.ttf' if display else work / 'Geist.ttf'), size)
        try: f.set_variation_by_axes([(650 if display else 550) if ax['name']==b'Weight' else ax['default'] for ax in f.get_variation_axes()])
        except (OSError, ValueError): pass
        return f
    mascot = Image.open(mascot_path).convert('RGBA')
    def text(draw, value, xy, size=34, display=False, fill=None, name='text'):
        f=font(size, display)
        rect=draw.textbbox(xy,value,font=f)
        bounded(name,rect)
        draw.text(xy,value,font=f,fill=fill or surface['ink'])
    def panel(draw, rect, fill=None):
        x0,y0,x1,y1=rect
        bounded('panel+shadow',(x0,y0,x1+card['offset'],y1+card['offset']))
        off=card['offset']
        draw.rounded_rectangle((x0+off,y0+off,x1+off,y1+off),radius=card['radius'],fill=surface['shadow'])
        draw.rounded_rectangle(rect,radius=card['radius'],fill=fill or surface['surface'],outline=surface['rule'],width=card['border'])
    parts=[]
    for i,scene in enumerate(edit['scenes']):
        bg=Image.new('RGBA',(1080,1920),surface['ground']);d=ImageDraw.Draw(bg)
        # Masthead uses the same coral series pill and Fredoka wordmark as Eddy reels.
        d.rounded_rectangle((left+4,top+4,left+176,top+52),radius=24,fill=surface['shadow'])
        d.rounded_rectangle((left,top,left+172,top+48),radius=24,fill=theme['accent'],outline=surface['ink'],width=4)
        bounded('series pill',(left,top,left+176,top+52))
        text(d,'CAMPING',(left+22,top+9),24,True,name='series label')
        text(d,'eddy.guide',(right-238,top+10),32,True,fill=surface['wordmark'],name='wordmark')
        m=mascot.resize((70,70),Image.Resampling.LANCZOS)
        bg.alpha_composite(m,(right-72,top+66));bounded('mascot',(right-72,top+66,right-2,top+136))
        for j,line in enumerate(scene['title']):
            text(d,line,(left,top+91+j*70),66,True,name='headline')
        stage=(left,top+260,right-8,top+1034)
        panel(d,stage)
        x0,y0,x1,y1=stage
        inner=(x0+6,y0+6,x1-6,y1-6)
        # All significant media lives in the safe corridor, including its ruled border.
        bounded('media',inner)
        capY=top+1070
        for j,line in enumerate(scene['caption']):
            text(d,line,(left+4,capY+j*43),32,False,name='caption')
        footer='Captured Oct 6, 2026 · AI voice' if i<4 else 'Eddy River Guide · AI voice'
        text(d,footer,(left+4,bottom-30),20,False,fill=surface['inkSecondary'],name='disclosure')
        if i==4:
            # Plain CTA, never a simulated clickable button.
            d.line((left+4,capY-16,left+170,capY-16),fill=theme['accent'],width=6)
        bg.save(work/f'chrome{i}.png')
        src=a.scenery if i==4 else a.screen
        frames=round(scene['end']*30)-round(scene['start']*30)
        seconds=frames/30
        iw,ih=inner[2]-inner[0],inner[3]-inner[1]
        crop=scene['crop']
        # Preserve real pixels, original playback speed, and pad short footage with its last frame.
        cropfilter=f"crop={crop[2]}:{crop[3]}:{crop[0]}:{crop[1]}," if crop else ''
        fit=(f'scale={iw}:{ih}:force_original_aspect_ratio=increase,crop={iw}:{ih}' if i==4 else
             f'scale={iw}:{ih}:force_original_aspect_ratio=decrease,pad={iw}:{ih}:(ow-iw)/2:(oh-ih)/2:color=white')
        filt=(f'[0:v]setpts=PTS-STARTPTS,{cropfilter}{fit},setsar=1,fps=30,'
              f'tpad=stop_mode=clone:stop_duration={seconds}[media];'
              f'[1:v][media]overlay={inner[0]}:{inner[1]}:eof_action=repeat,format=yuv420p[v]')
        part=work/f'part{i}.mp4'
        subprocess.run(['ffmpeg','-y','-v','error','-ss',str(scene['sourceStart']),'-t',str(scene['sourceDuration']),
            '-i',str(src),'-loop','1','-framerate','30','-i',str(work/f'chrome{i}.png'),'-filter_complex',filt,
            '-map','[v]','-r','30','-frames:v',str(frames),'-an','-c:v','libx264','-preset','fast','-crf','18',str(part)],check=True)
        parts.append(part)
    (work/'concat.txt').write_text(''.join(f"file '{part}'\n" for part in parts))
    a.output.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(work/'concat.txt'),
        '-i',str(voice),'-map','0:v','-map','1:a','-c:v','copy','-af','apad','-c:a','aac','-b:a','192k',
        '-t',str(edit['scenes'][-1]['end']),'-movflags','+faststart',str(a.output)],check=True)
    subprocess.run(['ffmpeg','-v','error','-i',str(a.output),'-f','null','-'],check=True)
    a.output.with_suffix('.layout.json').write_text(json.dumps({'safe':safe,'boxes':boxes,'voiceHash':review['hash']},indent=2))
    print(a.output)
