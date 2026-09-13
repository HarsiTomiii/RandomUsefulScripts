# icsToGoogleCalendar.py

Imports a single `.ics` calendar file as an event into your Google Calendar, then opens the created event in your default browser.

## What it does

1. Takes an `.ics` file — either passed as a command-line argument or picked via a file browser.
2. Parses the first `VEVENT` in it (summary, location, description, start/end times).
3. Logs into Google Calendar via OAuth (using credentials from `gcal_credentials.py`) and creates the event on your primary calendar.
4. Opens the newly created event's Google Calendar page in your default browser.

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Create a Google Cloud project (or reuse one) and enable the **Google Calendar API**:
   https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
3. Create an **OAuth 2.0 Client ID** of type **Desktop app**:
   https://console.cloud.google.com/apis/credentials
4. Copy `gcal_credentials.example.py` to `gcal_credentials.py` and fill in the `CLIENT_ID` / `CLIENT_SECRET` from step 3.
   `gcal_credentials.py` is listed in `.gitignore` so it never gets committed/pushed.

On first run, a browser window opens asking you to sign in and grant calendar access. The resulting token is cached in `token.json` (also gitignored) so you won't need to log in again until it expires or is revoked.

## Usage

Pass a file directly:

```bash
python icsToGoogleCalendar.py path/to/event.ics
```

Or run with no arguments to pick a file via a browser dialog:

```bash
python icsToGoogleCalendar.py
```

### Using it as the default app for `.ics` files

You can set this script as the program that opens `.ics` files on your OS, so double-clicking an `.ics` file imports it straight to Google Calendar. Point the file association at something like:

```
python C:\path\to\icsToGoogleCalendar.py "%1"
```

(adjust the path/quoting for your OS — on Windows this is done via "Open with" → "Choose another app" → browse to `python.exe` with the script as an argument, or a small wrapper `.bat`/shortcut that does the same).

## Notes / caveats

- Only the **first** `VEVENT` in the file is imported if the `.ics` contains several.
- All-day events (date-only, no time component) are created as all-day Google Calendar events.
- Events with a timezone-naive start/end are assumed to be UTC.
