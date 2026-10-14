// Shared by the gallery and the server's filename allowlist. HTML stays on disk
// outside public/ so no diagram can bypass the admin session check.
export const VISUAL_GUIDES = [
  {
    file: 'watershed.html',
    title: 'How Eddy fits together',
    description: 'Follow a river reading from the gauge to the website, app, and alerts.',
    group: 'Behind the scenes',
  },
  {
    file: 'social-delta.html',
    title: 'How social posts happen',
    description: 'See how a river update becomes a caption, a video, and a published post.',
    group: 'Behind the scenes',
  },
  {
    file: 'eddys-day.html',
    title: 'A day in Eddy’s life',
    description: 'Explore the daily rhythm of data refreshes, river reports, and background jobs.',
    group: 'Behind the scenes',
  },
  {
    file: 'condition-ladder.html',
    title: 'Understanding condition ratings',
    description: 'Move the water level and see how Eddy chooses a rating, including when data is missing.',
    group: 'Reading the river',
  },
  {
    file: 'how-eddys-read-works.html',
    title: 'How Eddy’s Read is made',
    description: 'Walk through the facts, writing, and checks behind a daily river report.',
    group: 'Reading the river',
  },
  {
    file: 'below-the-dam.html',
    title: 'What changes below a dam',
    description: 'Explore changing releases and why a float-time estimate can be misleading.',
    group: 'Reading the river',
  },
  {
    file: 'ios-tour.html',
    title: 'Take the iPhone tour',
    description: 'Tap through five example screens and learn what each part of the app does.',
    group: 'Exploring the app',
  },
  {
    file: 'ios-plumbing.html',
    title: 'Inside the iPhone app',
    description: 'See what connects the app, including what happens when you lose signal.',
    group: 'Exploring the app',
  },
  {
    file: 'float-board.html',
    title: 'Try the Float Board',
    description: 'Explore a trip-planning prototype with example routes and water levels.',
    group: 'Exploring the app',
  },
] as const;
