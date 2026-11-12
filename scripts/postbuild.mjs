// GitHub Pages has no server-side routing: serving index.html as 404.html makes
// deep links such as /rsvp?t=… and /register work.
import { copyFileSync, writeFileSync } from "node:fs";
copyFileSync("dist/index.html", "dist/404.html");
writeFileSync("dist/.nojekyll", "");
console.log("postbuild: 404.html + .nojekyll written");
