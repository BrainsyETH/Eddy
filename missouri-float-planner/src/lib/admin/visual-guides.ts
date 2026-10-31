// The catalog owns gallery order, standalone navigation and the server allowlist.
// Run npm run build:visual-guides after changing reader-facing metadata.
export const GUIDE_GROUPS = [
  { id: 'river', title: 'On the river' },
  { id: 'app', title: 'Using Eddy' },
  { id: 'inside', title: 'Behind the scenes' },
] as const;

export const VISUAL_GUIDES = [
  {
    file: 'condition-ladder.html', title: 'How Eddy rates a river', navTitle: 'River conditions',
    summary: 'Change a reading and see how Eddy rates it.',
    tryIt: 'Move the water level, then try a missing reading.',
    kind: 'demo', icon: 'eddy-checking-gauge', group: 'river',
  },
  {
    file: 'float-board.html', title: 'Build an example float', navTitle: 'Float planning',
    summary: 'Choose a stretch and compare the time at different water levels.',
    tryIt: 'Choose your put-in, take-out, and water level.',
    kind: 'demo', icon: 'eddy-route-planning', group: 'river',
  },
  {
    file: 'below-the-dam.html', title: 'A float below a dam', navTitle: 'Below a dam',
    summary: 'A release at the dam reaches each access at a different time.',
    tryIt: 'Change the launch time, then follow the water downstream.',
    kind: 'demo', icon: 'eddy-release', group: 'river',
  },
  {
    file: 'ios-tour.html', title: 'Take a look around Eddy', navTitle: 'iPhone tour',
    summary: 'Explore the five tabs and tap a marker to learn more.',
    tryIt: 'Switch tabs and tap the numbered markers.',
    kind: 'tour', icon: 'eddy-wave', group: 'app',
  },
  {
    file: 'ios-plumbing.html', title: 'What works without signal?', navTitle: 'The app, online and offline',
    summary: 'Try the same action with and without a connection.',
    tryIt: 'Open the app, turn off the signal, and try again.',
    kind: 'demo', icon: 'eddy-paddle-ready', group: 'app',
  },
  {
    file: 'how-eddys-read-works.html', title: 'How Eddy writes your Read', navTitle: 'Eddy’s Read',
    summary: 'Follow a river report from the first reading to the final check.',
    tryIt: 'Pick an example morning and step through the report.',
    kind: 'demo', icon: 'eddy-thinking', group: 'inside',
  },
  {
    file: 'watershed.html', title: 'From gauge to screen', navTitle: 'Where the data goes',
    summary: 'Follow a reading through Eddy to the places people see it.',
    tryIt: 'Choose a part of the map, or add a storm.',
    kind: 'demo', icon: 'eddy-water-droplet', group: 'inside',
  },
  {
    file: 'eddys-day.html', title: 'A day behind the scenes', navTitle: 'Daily schedule',
    summary: 'See when readings, reports, alerts, and other updates run.',
    tryIt: 'Pick a day and a task, then move through the clock.',
    kind: 'demo', icon: 'eddy-today', group: 'inside',
  },
  {
    file: 'social-delta.html', title: 'From river update to social post', navTitle: 'Social posts',
    summary: 'Follow an example through writing, checks, and publishing.',
    tryIt: 'Play an example day, or add a storm to follow an alert.',
    kind: 'demo', icon: 'eddy-ai-assistant', group: 'inside',
  },
] as const;

export type VisualGuide = (typeof VISUAL_GUIDES)[number];
export const START_HERE: VisualGuide['file'] = 'condition-ladder.html';
