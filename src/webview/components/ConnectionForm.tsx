import React, { useCallback, useState } from "react";
import { DbDriver } from "../../shared/types";
import type { DbConnectionConfig } from "../../shared/types";
import { randomId } from "../utils/randomId";

/** Props for the connection form (single callback on successful submit). */
interface ConnectionFormProps {
  /** Called with the new connection config and password when the user submits. */
  onAdd: (config: DbConnectionConfig & { password: string }) => void;
}

/** Default port per driver (used when switching driver and as fallback for invalid port). */
const DEFAULT_PORTS: Record<DbDriver, number> = {
  mssql: 1433,
  postgres: 5432,
  mysql: 3306,
};

/** Display label per driver for the selector buttons. */
const DRIVER_LABELS: Record<DbDriver, string> = {
  mssql: "SQL Server",
  postgres: "PostgreSQL",
  mysql: "MySQL",
};

/** Form state shape (all fields controlled). */
type ConnectionFormState = {
  label: string;
  driver: DbDriver;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  useSsl: boolean;
};

const INITIAL_FORM: ConnectionFormState = {
  label: "",
  driver: "postgres",
  host: "localhost",
  port: "5432",
  database: "",
  username: "",
  password: "",
  useSsl: false,
};

/**
 * Form for adding a new database connection: driver, host, port, database, username, password, SSL.
 * On submit, builds DbConnectionConfig (with random id), uses default port if port is invalid, and calls onAdd.
 */
export function ConnectionForm({ onAdd }: ConnectionFormProps) {
  const [form, setForm] = useState<ConnectionFormState>(INITIAL_FORM);

  const handleDriverChange = useCallback((driver: DbDriver) => {
    setForm((f) => ({ ...f, driver, port: String(DEFAULT_PORTS[driver]) }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const port = parseInt(form.port, 10);
      onAdd({
        id: randomId(),
        label: form.label || `${form.driver}@${form.host}/${form.database}`,
        driver: form.driver,
        host: form.host,
        port: Number.isFinite(port) ? port : DEFAULT_PORTS[form.driver],
        database: form.database,
        username: form.username,
        password: form.password,
        useSsl: form.useSsl,
      });
    },
    [form, onAdd]
  );

  return (
    <div className="max-w-lg space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Driver selector */}
        <div className="flex gap-2">
          {(["postgres", "mssql", "mysql"] as DbDriver[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDriverChange(d)}
              className={`px-3 py-1 rounded text-xs border transition-colors ${
                form.driver === d
                  ? "border-vscode-focusBorder bg-vscode-button-background text-vscode-button-foreground"
                  : "border-vscode-input-border hover:bg-vscode-list-hoverBackground"
              }`}
            >
              {DRIVER_LABELS[d]}
            </button>
          ))}
        </div>

        <Field label="Label (optional)">
          <Input value={form.label} onChange={(v) => setForm((f) => ({ ...f, label: v }))} placeholder="My Prod DB" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="Host">
              <Input value={form.host} onChange={(v) => setForm((f) => ({ ...f, host: v }))} placeholder="localhost" required />
            </Field>
          </div>
          <Field label="Port">
            <Input value={form.port} onChange={(v) => setForm((f) => ({ ...f, port: v }))} placeholder="5432" required />
          </Field>
        </div>
        <Field label="Database">
          <Input value={form.database} onChange={(v) => setForm((f) => ({ ...f, database: v }))} placeholder="mydb" required />
        </Field>
        <Field label="Username">
          <Input value={form.username} onChange={(v) => setForm((f) => ({ ...f, username: v }))} placeholder="admin" required />
        </Field>
        <Field label="Password">
          <Input type="password" value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} placeholder="••••••••" />
        </Field>
        <div className="space-y-0.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.useSsl}
              onChange={(e) => setForm((f) => ({ ...f, useSsl: e.target.checked }))}
              className="rounded"
            />
            Use SSL
          </label>
          <p className="text-xs opacity-60 pl-6">
            Leave unchecked for local or Docker databases. Check when connecting directly to a remote server (e.g. AWS RDS) that requires encrypted connections.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-vscode-button-background text-vscode-button-foreground text-sm hover:bg-vscode-button-hoverBackground transition-colors"
          >
            Add Connection
          </button>
        </div>
      </form>
    </div>
  );
}

/** Wraps a form field with a label. */
interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="space-y-0.5">
      <label className="text-xs opacity-70">{label}</label>
      {children}
    </div>
  );
}

/** Controlled text/password input with VS Code-themed styling. */
interface InputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}

function Input({ value, onChange, placeholder, type = "text", required }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full px-2 py-1 rounded border border-vscode-input-border bg-vscode-input-background text-vscode-input-foreground text-sm focus:outline-none focus:ring-1 focus:ring-vscode-focusBorder"
    />
  );
}
