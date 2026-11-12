/**
 * Tailwind build config (replaces the slow in-browser CDN compiler).
 * The CSS is rebuilt automatically when the server starts and a page/JS file is newer than it
 * (see utils/assets.js). Manual build: npm run build:css
 *
 * NOTE for developers: always write FULL class names in the code (e.g. 'bg-emerald-50'),
 * never build them from pieces like `bg-${color}-50`, or the build can't see them.
 */
module.exports = {
  content: ['./public/index.html', './public/js/**/*.js'],
  darkMode: 'class', // follows the site's own dark/light toggle (Theme in themeToggle.js)
  theme: {
    extend: {
      fontFamily: { sans: ['Cairo', 'sans-serif'] },
      colors: { primary: '#059669' }
    }
  },
  plugins: []
};
