const fs = require('fs');
const https = require('https');
const path = require('path');

const THEMES_DIR = __dirname;
const DATA_DIR = path.join(THEMES_DIR, 'data');

// Create data directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Parse ghostty config format to extract colors
function parseGhosttyTheme(content) {
  const colors = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^palette\s*=\s*"?([^"]+)"?$/) ||
                  trimmed.match(/^([a-z-]+)\s*=\s*"?([^"]+)"?$/);

    if (match) {
      if (match[1] === 'palette') {
        // Parse palette colors
        const paletteColors = match[1].split(':').slice(1);
        paletteColors.forEach((color, idx) => {
          colors[`palette_${idx}`] = color.trim();
        });
      } else {
        colors[match[1]] = match[2];
      }
    }
  }

  return colors;
}

// Fetch theme list from GitHub API
async function fetchThemeList() {
  return new Promise((resolve, reject) => {
    https.get(
      'https://api.github.com/repos/mbadolato/iTerm2-Color-Schemes/contents/ghostty',
      {
        headers: { 'User-Agent': 'ghostty-themes-downloader' }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    ).on('error', reject);
  });
}

// Download single theme
async function downloadTheme(downloadUrl, themeName) {
  return new Promise((resolve, reject) => {
    https.get(downloadUrl, (res) => {
      let content = '';
      res.on('data', chunk => (content += chunk));
      res.on('end', () => {
        try {
          const colors = parseGhosttyTheme(content);
          resolve({ themeName, colors, rawContent: content });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Main function
async function main() {
  try {
    console.log('📥 Fetching theme list from GitHub...');
    const themes = await fetchThemeList();
    console.log(`✓ Found ${themes.length} themes\n`);

    const themesData = {};
    let downloaded = 0;
    let failed = 0;

    // Download themes with concurrency limit (5 at a time)
    for (let i = 0; i < themes.length; i += 5) {
      const batch = themes.slice(i, i + 5);
      const promises = batch.map(theme =>
        downloadTheme(theme.download_url, theme.name)
          .then(result => {
            themesData[result.themeName] = result.colors;
            downloaded++;
            process.stdout.write(
              `\r⬇️  Downloaded: ${downloaded}/${themes.length}`
            );
            return result;
          })
          .catch(err => {
            failed++;
            console.error(`\n❌ Failed to download "${batch.name}": ${err.message}`);
          })
      );
      await Promise.all(promises);
    }

    console.log(`\n✓ Download complete! (${downloaded} success, ${failed} failed)\n`);

    // Save themes to JSON
    const outputFile = path.join(DATA_DIR, 'themes.json');
    fs.writeFileSync(outputFile, JSON.stringify(themesData, null, 2));
    console.log(`✓ Saved theme data to ${outputFile}`);

    // Create index of theme names
    const themeNames = Object.keys(themesData).sort();
    const indexFile = path.join(DATA_DIR, 'themes-index.json');
    fs.writeFileSync(indexFile, JSON.stringify(themeNames, null, 2));
    console.log(`✓ Saved theme index to ${indexFile}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
