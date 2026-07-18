import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── googleapis mock ─────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const valuesGet = vi.fn();
  const valuesUpdate = vi.fn();
  const valuesAppend = vi.fn();
  const spreadsheetsGet = vi.fn();
  const batchUpdate = vi.fn();
  const GoogleAuth = vi.fn().mockImplementation((opts: unknown) => ({ opts }));
  const sheetsFactory = vi.fn(() => ({
    spreadsheets: {
      get: spreadsheetsGet,
      batchUpdate,
      values: { get: valuesGet, update: valuesUpdate, append: valuesAppend },
    },
  }));
  return { valuesGet, valuesUpdate, valuesAppend, spreadsheetsGet, batchUpdate, GoogleAuth, sheetsFactory };
});

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: mocks.GoogleAuth },
    sheets: mocks.sheetsFactory,
  },
}));

import {
  getSheets,
  ensureSheet,
  appendRow,
  getRows,
  getUsersFromSheet,
  ensureUsersSheet,
} from './googleSheets';

const ENV = {
  GOOGLE_SHEETS_PRIVATE_KEY: 'line1\\nline2',
  GOOGLE_SHEETS_CLIENT_EMAIL: 'svc@example.com',
  GOOGLE_SHEETS_SPREADSHEET_ID: 'SHEET_ID',
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(process.env, ENV);
});

afterEach(() => {
  delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  delete process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
});

describe('getSheets', () => {
  it('throws when environment variables are missing', () => {
    delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    expect(() => getSheets()).toThrow(/environment variables are missing/i);
  });

  it('returns the spreadsheetId and a sheets client when configured', () => {
    const result = getSheets();
    expect(result.spreadsheetId).toBe('SHEET_ID');
    expect(mocks.sheetsFactory).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v4' })
    );
  });

  it('normalizes escaped newlines and surrounding quotes in the private key', () => {
    process.env.GOOGLE_SHEETS_PRIVATE_KEY = '"line1\\nline2"';
    getSheets();
    const passedCreds = mocks.GoogleAuth.mock.calls[0][0].credentials;
    expect(passedCreds.private_key).toBe('line1\nline2');
    expect(passedCreds.client_email).toBe('svc@example.com');
  });
});

describe('ensureSheet', () => {
  const client = () => getSheets().sheets;

  it('does nothing when the sheet already exists', async () => {
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Users' } }] } });
    await ensureSheet(client(), 'SHEET_ID', 'Users', ['a', 'b']);
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
    expect(mocks.valuesUpdate).not.toHaveBeenCalled();
  });

  it('creates the sheet and writes headers when missing', async () => {
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Other' } }] } });
    await ensureSheet(client(), 'SHEET_ID', 'NewSheet', ['h1', 'h2']);
    expect(mocks.batchUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ requestBody: { values: [['h1', 'h2']] } })
    );
  });

  it('wraps underlying errors with a descriptive message', async () => {
    mocks.spreadsheetsGet.mockRejectedValue(new Error('boom'));
    await expect(ensureSheet(client(), 'SHEET_ID', 'X', [])).rejects.toThrow(/Failed to setup sheet: X/);
  });
});

describe('appendRow', () => {
  it('appends a single row to the sheet', async () => {
    mocks.valuesAppend.mockResolvedValue({});
    await appendRow(getSheets().sheets, 'SHEET_ID', 'Log', ['a', 1]);
    expect(mocks.valuesAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'Log!A:Z',
        requestBody: { values: [['a', 1]] },
      })
    );
  });

  it('throws a descriptive error on failure', async () => {
    mocks.valuesAppend.mockRejectedValue(new Error('nope'));
    await expect(appendRow(getSheets().sheets, 'SHEET_ID', 'Log', [])).rejects.toThrow(
      /Failed to append row to sheet: Log/
    );
  });
});

describe('getRows', () => {
  it('returns the rows from the sheet', async () => {
    mocks.valuesGet.mockResolvedValue({ data: { values: [['a'], ['b']] } });
    const rows = await getRows(getSheets().sheets, 'SHEET_ID', 'Data');
    expect(rows).toEqual([['a'], ['b']]);
  });

  it('returns an empty array when the sheet has no values', async () => {
    mocks.valuesGet.mockResolvedValue({ data: {} });
    const rows = await getRows(getSheets().sheets, 'SHEET_ID', 'Data');
    expect(rows).toEqual([]);
  });

  it('throws a descriptive error on failure', async () => {
    mocks.valuesGet.mockRejectedValue(new Error('down'));
    await expect(getRows(getSheets().sheets, 'SHEET_ID', 'Data')).rejects.toThrow(
      /Failed to read from sheet: Data/
    );
  });
});

describe('ensureUsersSheet', () => {
  it('creates the Users sheet with headers when it is missing', async () => {
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Other' } }] } });
    mocks.batchUpdate.mockResolvedValue({});
    mocks.valuesUpdate.mockResolvedValue({});
    await ensureUsersSheet();
    expect(mocks.batchUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.valuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        range: 'Users!A1:E1',
        requestBody: { values: [['Staff ID', 'PasscodeHash', 'Name', 'Role', 'School']] },
      })
    );
  });

  it('does nothing when the Users sheet already exists', async () => {
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Users' } }] } });
    await ensureUsersSheet();
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
  });

  it('throws a descriptive error on failure', async () => {
    mocks.spreadsheetsGet.mockRejectedValue(new Error('boom'));
    await expect(ensureUsersSheet()).rejects.toThrow(/Failed to setup Users sheet/);
  });
});

describe('getUsersFromSheet', () => {
  beforeEach(() => {
    // Users sheet already exists so ensureUsersSheet() is a no-op.
    mocks.spreadsheetsGet.mockResolvedValue({ data: { sheets: [{ properties: { title: 'Users' } }] } });
  });

  it('maps rows keyed by staff id, trimming values and dropping the plaintext', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          ['Staff ID', 'PasscodeHash', 'Name', 'Role', 'School'],
          [' S1 ', ' hash1 ', ' Alice ', ' teacher ', ' Green School '],
        ],
      },
    });
    const users = await getUsersFromSheet();
    expect(users).toEqual({
      S1: { passcode: 'hash1', name: 'Alice', role: 'teacher', school: 'Green School' },
    });
  });

  it('returns an empty object when there are no data rows', async () => {
    mocks.valuesGet.mockResolvedValue({ data: { values: [['Staff ID', 'PasscodeHash', 'Name', 'Role', 'School']] } });
    await expect(getUsersFromSheet()).resolves.toEqual({});
  });

  it('skips rows missing a staff id or passcode hash', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: {
        values: [
          ['Staff ID', 'PasscodeHash', 'Name', 'Role', 'School'],
          ['', 'hash', 'NoId', 'r', 's'],
          ['S2', '', 'NoHash', 'r', 's'],
          ['S3', 'hash3', 'Valid', 'r', 's'],
        ],
      },
    });
    const users = await getUsersFromSheet();
    expect(Object.keys(users)).toEqual(['S3']);
  });

  it('returns an empty object when a required column is missing', async () => {
    mocks.valuesGet.mockResolvedValue({
      data: { values: [['Staff ID', 'Name', 'Role', 'School'], ['S1', 'Alice', 'r', 's']] },
    });
    await expect(getUsersFromSheet()).resolves.toEqual({});
  });

  it('returns an empty object when the API call fails', async () => {
    mocks.valuesGet.mockRejectedValue(new Error('api down'));
    await expect(getUsersFromSheet()).resolves.toEqual({});
  });
});
