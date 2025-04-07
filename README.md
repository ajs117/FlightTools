# FlightTools

A comprehensive suite of flight-related tools built with React and TypeScript. This application provides various utilities for flight planning, tracking, and in-flight monitoring.

## Features

- **Flight Calculator**: Calculate flight metrics, distances, and visualize routes with day/night terminator
- **Flight Tracker**: Track real-time flights around the world
- **Flight Plan Drawer**: Create and export custom flight plans for Microsoft Flight Simulator
- **In-Flight Tracker**: Monitor your current flight progress and details using GPS

## Technologies Used

- React 19
- TypeScript
- Leaflet.js for map visualization
- TailwindCSS for styling
- Material-UI components
- Various flight-related APIs and libraries

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ajs117/FlightTools.git
cd FlightTools
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## Available Scripts

- `npm start`: Runs the app in development mode
- `npm test`: Launches the test runner
- `npm run build`: Builds the app for production
- `npm run deploy`: Deploys the app to GitHub Pages

## Project Structure

- `src/components/`: Contains all React components
  - `FlightCalculator.tsx`: Flight calculation and route visualization
  - `FlightTracker.tsx`: Real-time flight tracking
  - `FlightPlanDrawer.tsx`: Flight plan creation and export
  - `InFlightTracker.tsx`: In-flight monitoring using GPS
- `src/context/`: Contains React context providers
- `public/`: Static assets and HTML template

## Features in Detail

### Flight Calculator
- Calculate distances between airports
- Visualize flight routes on an interactive map
- View day/night terminator for flight planning
- Calculate flight durations and time zone differences

### Flight Tracker
- Track real-time flights worldwide
- View aircraft positions and details
- Filter and search for specific flights

### Flight Plan Drawer
- Create custom flight plans
- Add waypoints and airports
- Export plans in MSFS-compatible format
- Interactive map for route planning

### In-Flight Tracker
- Real-time GPS tracking
- Display current position, altitude, and speed
- Show heading and accuracy information
- Works offline with cached map tiles

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenStreetMap for map data
- Various flight data APIs
- The React and TypeScript communities
