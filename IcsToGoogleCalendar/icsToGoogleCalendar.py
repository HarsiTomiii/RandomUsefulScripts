import argparse
import os
import sys
import webbrowser

import tkinter as tk
from tkinter import filedialog

from icalendar import Calendar
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

try:
    import gcal_credentials
except ImportError:
    print(
        "gcal_credentials.py not found.\n"
        "Copy gcal_credentials.example.py to gcal_credentials.py and fill in "
        "your Google OAuth client id/secret (see README.md)."
    )
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_PATH = os.path.join(SCRIPT_DIR, "token.json")
SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


def browse_for_ics():
    root = tk.Tk()
    root.withdraw()
    path = filedialog.askopenfilename(
        title="Select .ics file",
        filetypes=[("Calendar files", "*.ics"), ("All files", "*.*")],
    )
    return path or None


def get_credentials():
    creds = None
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            client_config = {
                "installed": {
                    "client_id": gcal_credentials.CLIENT_ID,
                    "client_secret": gcal_credentials.CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": ["http://localhost"],
                }
            }
            flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())

    return creds


def ics_dt_to_google(dt):
    # date-only (all-day events) come back as datetime.date, not datetime.datetime
    if not hasattr(dt, "hour"):
        return {"date": dt.isoformat()}
    if dt.tzinfo is not None:
        return {"dateTime": dt.isoformat()}
    return {"dateTime": dt.isoformat(), "timeZone": "UTC"}


def parse_ics(input_path):
    with open(input_path, "rb") as f:
        cal = Calendar.from_ical(f.read())

    events = [c for c in cal.walk() if c.name == "VEVENT"]
    if not events:
        print("no VEVENT found in the ics file")
        return None
    if len(events) > 1:
        print(f"found {len(events)} events, using the first one")

    event = events[0]
    body = {
        "summary": str(event.get("summary", "")),
        "location": str(event.get("location", "")),
        "description": str(event.get("description", "")),
        "start": ics_dt_to_google(event.get("dtstart").dt),
        "end": ics_dt_to_google(event.get("dtend").dt),
    }
    return body


def create_event(ics_path):
    if not os.path.exists(ics_path):
        print(f"file not found: {ics_path}")
        return

    body = parse_ics(ics_path)
    if body is None:
        return

    creds = get_credentials()
    service = build("calendar", "v3", credentials=creds)
    created = service.events().insert(calendarId="primary", body=body).execute()

    link = created.get("htmlLink")
    print(f"event created: {link}")
    if link:
        webbrowser.open(link)


def main():
    parser = argparse.ArgumentParser(
        description="Import a .ics file as an event into Google Calendar."
    )
    parser.add_argument(
        "ics_file",
        nargs="?",
        default=None,
        help="Path to the .ics file to import. If omitted, a file picker opens.",
    )
    args = parser.parse_args()

    ics_path = args.ics_file or browse_for_ics()
    if not ics_path:
        print("no file selected")
        return

    create_event(ics_path)


if __name__ == "__main__":
    main()
