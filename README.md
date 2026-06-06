# TrainRight Health

The combined health app: **TrainRight** (16-week training program) + **Nutrition & Activity Tracker** merged into one React + TypeScript PWA.

## What was merged
- Training: 16-week "Calisthenics Foundation 16" program (see PROGRAM.md), session logging with set tracking, Green/Yellow/Red readiness that auto-adjusts volume, daily shoulder-pain slider that removes pain-restricted exercises, rest timer, bodyweight log, last-session placeholders (no phantom logs).
- Nutrition: everything from the original tracker (SA food database, calendar, analytics, pushups, steps, achievements) — now with **training-day vs rest-day macro targets** that switch automatically.
- Migration: Settings -> "Program & nutrition targets" -> import old TrainRight (`trainright_v1` JSON) and full nutrition backups.

## Garmin sync
1. Once-off: `pip install garminconnect` then `python garmin_sync.py --login`
2. Daily (or via Task Scheduler): `run_garmin_sync.bat` — writes `dist/garmin_health.json`
3. Open the app — it auto-absorbs the file: steps update, and the Train tab shows a Green/Yellow/Red readiness suggestion from your sleep + resting-HR trend.
Note: Apple Health itself can't be read by a web app — Garmin Connect is the data source (your watch syncs there first anyway).

## Quick start (already built)
Run `start_app.bat` and open http://localhost:8080 (or the shown IPv4 on your phone).

## Development


### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## PWA Icons

Before deploying, generate PWA icons:

1. Create a 512x512px icon for your app
2. Use a tool like [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator) or [Favicon Generator](https://realfavicongenerator.net/)
3. Place the generated icons in the `public` folder:
   - `pwa-192x192.png`
   - `pwa-512x512.png`
   - `apple-touch-icon.png`
   - `favicon.ico`

## Deploying to iPhone

### Method 1: Deploy to a Web Server

1. Build the app:
   ```bash
   npm run build
   ```

2. Deploy the `dist` folder to any web hosting service:
   - **Vercel**: `npm install -g vercel && vercel`
   - **Netlify**: Drag & drop the `dist` folder to [Netlify Drop](https://app.netlify.com/drop)
   - **GitHub Pages**: Push to GitHub and enable GitHub Pages
   - **Firebase Hosting**: `firebase deploy`

3. On your iPhone, open Safari and navigate to your deployed URL

4. Tap the Share button (square with arrow pointing up)

5. Scroll down and tap "Add to Home Screen"

6. Enter a name and tap "Add"

7. The app will now appear on your home screen and work offline!

### Method 2: Local Testing

For testing locally on iPhone:

1. Start the dev server:
   ```bash
   npm run dev -- --host
   ```

2. Note the local IP address shown (e.g., `http://192.168.1.xxx:5173`)

3. On your iPhone (connected to the same WiFi):
   - Open Safari
   - Navigate to the IP address from step 2
   - Add to Home Screen as described above

## Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Chart.js** for analytics visualizations
- **date-fns** for date manipulation
- **Lucide React** for icons
- **vite-plugin-pwa** for PWA functionality
- **localStorage** for offline data persistence

## Project Structure

```
src/
├── components/        # React components
│   ├── Calendar.tsx
│   ├── DailySummary.tsx
│   ├── FoodEntry.tsx
│   ├── ExerciseEntry.tsx
│   ├── Settings.tsx
│   └── Analytics.tsx
├── contexts/         # React contexts
│   └── ThemeContext.tsx
├── data/            # Data files
│   └── foodDatabase.ts
├── types/           # TypeScript type definitions
│   └── index.ts
├── utils/           # Utility functions
│   └── storage.ts
├── App.tsx          # Main app component
└── main.tsx         # Entry point
```

## Food Database

The app includes a comprehensive food database with:
- Common proteins (chicken, beef, fish, etc.)
- Vegetables and fruits
- Grains and legumes
- South African favorites (biltong, boerewors, pap, etc.)
- Popular SA brands (Ouma Rusks, Mrs Ball's Chutney, etc.)

You can easily add more foods by editing `src/data/foodDatabase.ts`.

## Customization

### Adding Custom Foods

Edit `src/data/foodDatabase.ts` and add entries following this format:

```typescript
{
  id: 'unique-food-id',
  name: 'Food Name',
  calories: 100,  // per 100g
  protein: 20,    // per 100g
  carbs: 10,      // per 100g
  fats: 5,        // per 100g
  category: 'Protein',
  brand: 'Optional Brand',
}
```

### Adjusting Default Targets

Default daily targets are set in `src/utils/storage.ts`. Users can customize these in the Settings page.

## Browser Support

- iOS Safari 11.3+
- Chrome for Android
- Modern desktop browsers

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!
