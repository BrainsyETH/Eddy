// Shared by the gallery and the server's filename allowlist. HTML stays on disk
// outside public/ so no diagram can bypass the admin session check.
//
// Each card leads with the question its guide answers, then one line on what
// you can try. `title` must match the guide's own <h1> so the card and the page
// it opens agree; visual-guides.test.ts checks this.
export const VISUAL_GUIDES = [
  {
    file: 'watershed.html',
    title: 'How Eddy comes together',
    question: 'How does a gauge reading reach the app?',
    tryIt: 'Play a gauge update, or add rain and watch the readings change.',
    kind: 'demo',
    icon: 'map',
    group: 'Behind the scenes',
  },
  {
    file: 'eddys-day.html',
    title: 'A day behind the scenes',
    question: 'What runs on its own every day?',
    tryIt: 'Pick a task and slide through the day to see when it runs.',
    kind: 'demo',
    icon: 'clock',
    group: 'Behind the scenes',
  },
  {
    file: 'social-delta.html',
    title: 'From river update to social post',
    question: 'How does a river update become a post?',
    tryIt: 'Play an example day, or add a storm to follow an alert post.',
    kind: 'demo',
    icon: 'share',
    group: 'Behind the scenes',
  },
  {
    file: 'condition-ladder.html',
    title: 'What makes a river Good or Flowing?',
    question: 'How does Eddy rate a river?',
    tryIt: 'Move the water level, or try a missing reading.',
    kind: 'demo',
    icon: 'gauge',
    group: 'Reading the river',
  },
  {
    file: 'how-eddys-read-works.html',
    title: 'How Eddy writes your Read',
    question: 'How is the daily Read written and checked?',
    tryIt: 'Pick a morning and step through it.',
    kind: 'demo',
    icon: 'pen',
    group: 'Reading the river',
  },
  {
    file: 'below-the-dam.html',
    title: 'Why dam releases change a float',
    question: 'Why is there no float time below some dams?',
    tryIt: 'Drag through the day and change the launch time.',
    kind: 'demo',
    icon: 'waves',
    group: 'Reading the river',
  },
  {
    file: 'ios-tour.html',
    title: 'Take a look around Eddy',
    question: 'What’s on each screen of the iPhone app?',
    tryIt: 'Switch tabs and tap the numbered markers.',
    kind: 'tour',
    icon: 'phone',
    group: 'Exploring the app',
  },
  {
    file: 'ios-plumbing.html',
    title: 'What happens inside the app',
    question: 'How does the app get its data, even offline?',
    tryIt: 'Open the app, then turn the signal off and try again.',
    kind: 'demo',
    icon: 'signal',
    group: 'Exploring the app',
  },
  {
    file: 'float-board.html',
    title: 'Find your kind of float',
    question: 'How does the water level change trip time?',
    tryIt: 'Pick a put-in and take-out, then change the water level.',
    kind: 'demo',
    icon: 'route',
    group: 'Exploring the app',
  },
] as const;

export type VisualGuide = (typeof VISUAL_GUIDES)[number];

/** The guide to suggest to someone new: the big-picture map. */
export const START_HERE: VisualGuide['file'] = 'watershed.html';
