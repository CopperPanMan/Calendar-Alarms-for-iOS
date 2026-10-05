// Calendar Alarms — Script + Alarm Tone Installer
//
// Intended to run INLINE from a Scriptable action inside the setup Shortcut.
//
// Behavior:
// - Looks for Calendar Alarm Engine.js
// - Looks for Calendar Alarm QR Scanner.js
// - Looks for Calendar Alarms Runtime.js
// - Downloads missing scripts from GitHub
// - Looks for the Scriptable bookmark named "Shortcuts"
// - Creates:
//     Shortcuts/OpenHabits/Calendar Alarms/Alarm Tones
//   if needed
// - Downloads the six built-in alarm tones if missing
// - NEVER overwrites an existing script or alarm tone
// - Returns JSON describing what happened

// ---------------------------------------------------------
// Repository configuration
// ---------------------------------------------------------

const REPO_OWNER = "CopperPanMan";
const REPO_NAME = "Calendar-Alarms-for-iOS";

// DEVELOPMENT:
// Use "main" while actively developing.
//
// RELEASE:
// Change this to a release tag such as "v1.0.0".
const VERSION = "main";

// ---------------------------------------------------------
// Script files
// ---------------------------------------------------------

const FILES = [
{
name: "Calendar Alarm Engine.js",
marker: "Script.setShortcutOutput",
},
{
name: "Calendar Alarm QR Scanner.js",
marker: "Script.setShortcutOutput",
},
{
name: "Calendar Alarms Runtime.js",
marker: "Script.setShortcutOutput",
},
];

// ---------------------------------------------------------
// Alarm tone files
// ---------------------------------------------------------

// Folder inside the GitHub repository containing the MP3 files.
const SOUND_SOURCE_DIRECTORY = "qr alarm ringtones";

const SOUND_FILES = [
"marimba.mp3",
"ocean.mp3",
"siren.mp3",
"sonar.mp3",
"marimba electric.mp3",
"spring forest.mp3",
];

// Scriptable bookmark that should point to:
//
// iCloud Drive / Shortcuts
//
const SHORTCUTS_BOOKMARK = "Shortcuts";

// ---------------------------------------------------------
// Result object
// ---------------------------------------------------------

const result = {
ok: true,

// Preserve the original installer output.
installed: [],
alreadyPresent: [],
errors: [],

// Alarm-tone-specific output.
soundsInstalled: [],
soundsAlreadyPresent: [],
};

// ---------------------------------------------------------
// Pick Scriptable's scripts directory
// ---------------------------------------------------------

function getScriptDirectory() {
// Calendar Alarms already relies heavily on iCloud, so prefer
// Scriptable's iCloud documents directory.
try {
const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();

if (dir) {
  return {
    fm,
    dir,
    storage: "iCloud",
  };
}

} catch (e) {
// Fall through to local storage.
}

const fm = FileManager.local();

return {
fm,
dir: fm.documentsDirectory(),
storage: "local",
};
}

// ---------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------

function rawGitHubURL(relativePath) {
// Encode each path component individually.
// This preserves "/" while correctly encoding spaces.
const encodedPath = relativePath
.split("/")
.map(part => encodeURIComponent(part))
.join("/");

return (
`https://raw.githubusercontent.com/` +
`${REPO_OWNER}/${REPO_NAME}/${VERSION}/${encodedPath}`
);
}

async function downloadScript(file) {
const url = rawGitHubURL(file.name);

const req = new Request(url);
req.timeoutInterval = 20;

const source = await req.loadString();
const status = req.response?.statusCode ?? 0;

if (status !== 200) {
throw new Error(
`GitHub returned HTTP ${status} for ${file.name}`
);
}

// Basic sanity checks so a bad response never becomes
// a Scriptable script.
if (
typeof source !== "string" ||
source.length < 100 ||
!source.includes(file.marker)
) {
throw new Error(
`Downloaded contents of ${file.name} did not look like the expected script.`
);
}

return source;
}

async function downloadSound(fileName) {
const relativePath =
`${SOUND_SOURCE_DIRECTORY}/${fileName}`;

const url = rawGitHubURL(relativePath);

const req = new Request(url);
req.timeoutInterval = 30;

// MP3 files are binary, so download raw Data.
const data = await req.load();
const status = req.response?.statusCode ?? 0;

if (status !== 200) {
throw new Error(
`GitHub returned HTTP ${status} for ${fileName}`
);
}

if (!data || data.length === 0) {
throw new Error(
`Downloaded contents of ${fileName} were empty.`
);
}

return data;
}

// ---------------------------------------------------------
// Install Scriptable scripts
// ---------------------------------------------------------

const {
fm: scriptFM,
dir: scriptDir,
storage,
} = getScriptDirectory();

result.storage = storage;
result.directory = scriptDir;
result.version = VERSION;

for (const file of FILES) {
const destination = scriptFM.joinPath(
scriptDir,
file.name
);

try {
if (scriptFM.fileExists(destination)) {
result.alreadyPresent.push(file.name);
continue;
}

const source = await downloadScript(file);

// Check again immediately before writing.
if (scriptFM.fileExists(destination)) {
  result.alreadyPresent.push(file.name);
  continue;
}

scriptFM.writeString(destination, source);

// Verify creation succeeded.
if (!scriptFM.fileExists(destination)) {
  throw new Error(
    `File write did not create ${file.name}`
  );
}

result.installed.push(file.name);

} catch (e) {
result.ok = false;

result.errors.push(
  `${file.name}: ${String(e)}`
);

}
}

// ---------------------------------------------------------
// Locate / create the Alarm Tones directory
// ---------------------------------------------------------

let soundFM = null;
let alarmTonesDir = null;

try {
soundFM = FileManager.iCloud();

if (!soundFM.bookmarkExists(SHORTCUTS_BOOKMARK)) {
throw new Error(
`The Scriptable bookmark "${SHORTCUTS_BOOKMARK}" was not found.`  +
`It should point to the iCloud Drive Shortcuts folder.`
);
}

const shortcutsDir =
soundFM.bookmarkedPath(SHORTCUTS_BOOKMARK);

// Target:
//
// Shortcuts/
//   OpenHabits/
//     Calendar Alarms/
//       Alarm Tones/
//
const openHabitsDir = soundFM.joinPath(
shortcutsDir,
"OpenHabits"
);

const calendarAlarmsDir = soundFM.joinPath(
openHabitsDir,
"Calendar Alarms"
);

alarmTonesDir = soundFM.joinPath(
calendarAlarmsDir,
"Alarm Tones"
);

// Create all missing intermediate directories.
if (!soundFM.fileExists(alarmTonesDir)) {
soundFM.createDirectory(
alarmTonesDir,
true
);
}

if (
!soundFM.fileExists(alarmTonesDir) ||
!soundFM.isDirectory(alarmTonesDir)
) {
throw new Error(
"Could not create the Calendar Alarms/Alarm Tones directory."
);
}

result.soundDirectory =
"Shortcuts/OpenHabits/Calendar Alarms/Alarm Tones";

} catch (e) {
result.ok = false;

result.errors.push(
`Alarm Tones directory: ${String(e)}`
);

// Prevent sound installation if the directory setup failed.
soundFM = null;
alarmTonesDir = null;
}

// ---------------------------------------------------------
// Install alarm tones
// ---------------------------------------------------------

if (soundFM && alarmTonesDir) {
for (const fileName of SOUND_FILES) {
const destination = soundFM.joinPath(
alarmTonesDir,
fileName
);

try {
  // Never overwrite an existing alarm tone.
  if (soundFM.fileExists(destination)) {
    result.soundsAlreadyPresent.push(fileName);
    continue;
  }

  const data = await downloadSound(fileName);

  // Check again immediately before writing.
  if (soundFM.fileExists(destination)) {
    result.soundsAlreadyPresent.push(fileName);
    continue;
  }

  soundFM.write(destination, data);

  // Verify creation succeeded.
  if (!soundFM.fileExists(destination)) {
    throw new Error(
      `File write did not create ${fileName}`
    );
  }

  result.soundsInstalled.push(fileName);

} catch (e) {
  result.ok = false;

  result.errors.push(
    `${fileName}: ${String(e)}`
  );
}

}
}

// ---------------------------------------------------------
// Return to Shortcuts
// ---------------------------------------------------------

Script.setShortcutOutput(
JSON.stringify(result)
);
