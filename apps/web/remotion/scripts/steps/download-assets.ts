/**
 * Step 2: Download Eddy mascot images from Vercel Blob storage.
 */

import path from "path";
import fs from "fs";
import https from "https";
import http from "http";

interface AssetDownload {
  filename: string;
  url: string;
}

const MASCOT_ASSETS: AssetDownload[] = [
  {
    filename: "eddy-standard.png",
    url: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png",
  },
  {
    filename: "eddy-canoe.png",
    url: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png",
  },
  {
    filename: "eddy-flag.png",
    url: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png",
  },
  {
    filename: "eddy-green.png",
    url: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png",
  },
  {
    filename: "eddy-favicon.png",
    url: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png",
  },
];

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith("https") ? https : http;

    protocol
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(dest);
            return downloadFile(redirectUrl, dest).then(resolve, reject);
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve());
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

export async function downloadMascotAssets(publicDir: string): Promise<void> {
  const eddyDir = path.join(publicDir, "eddy");
  fs.mkdirSync(eddyDir, { recursive: true });

  for (const asset of MASCOT_ASSETS) {
    const dest = path.join(eddyDir, asset.filename);

    // Skip if already downloaded
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`  Skipping ${asset.filename} (already exists)`);
      continue;
    }

    console.log(`  Downloading ${asset.filename}...`);
    try {
      await downloadFile(asset.url, dest);
      const size = fs.statSync(dest).size;
      console.log(`  Downloaded ${asset.filename} (${(size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`  Failed to download ${asset.filename}:`, err);
    }
  }

  console.log(`\nMascot assets downloaded to ${eddyDir}`);
}
