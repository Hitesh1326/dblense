import React, { useState } from "react";
import { DbConnectionConfig, DbDriver } from "../../shared/types";
import { randomId } from "../utils/randomId";

interface ConnectionFormProps {
  connections: DbConnectionConfig[];
  onAdd: (config: DbConnectionConfig & { password: string }) => void;
  onTest: (id: string) => void;
  onRemove: (id: string) => void;
}

const DEFAULT_PORTS: Record<DbDriver, number> = {
  mssql: 1433,
  postgres: 5432,
  mysql: 3306,
};

export function ConnectionForm({
  connections,
  onAdd,
  onTest,
  onRemove,
}: ConnectionFormProps) {
  const [form, setForm] = useState<{
    label: string;
    driver: DbDriver;
    host: string;
    port: string;
    database: string;
    username: string;
    password: string;
    useSsl: boolean;
  }>({
    label: "",
    driver: "postgres",
    host: "localhost",
    port: "5432",
    database: "",
    username: "",
    password: "",
    useSsl: false,
  });

  const handleDriverChange = (driver: DbDriver) => {
    setForm((f) => ({ ...f, driver, port: String(DEFAULT_PORTS[driver]) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: randomId(),
      label: form.label || `${form.driver}@${form.host}/${form.database}`,
      driver: form.driver,
      host: form.host,
      port: parseInt(form.port, 10),
      database: form.database,
      username: form.username,
      password: form.password,
      useSsl: form.useSsl,
    });
  };

  return (
    <div className="p-4 max-w-lg space-y-6">
      <h2 className="text-base font-semibold">Add Connection</h2>

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
              {d === "mssql" ? "SQL Server" : d === "postgres" ? "PostgreSQL" : "MySQL"}
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
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.useSsl}
            onChange={(e) => setForm((f) => ({ ...f, useSsl: e.target.checked }))}
            className="rounded"
          />
          Use SSL
        </label>

        <button
          type="submit"
          className="w-full py-1.5 rounded bg-vscode-button-background text-vscode-button-foreground text-sm hover:bg-vscode-button-hoverBackground transition-colors"
        >
          Add Connection
        </button>
      </form>

      {/* Existing connections */}
      {connections.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider opacity-50 mb-2">
            Existing Connections
          </h3>
          <ul className="space-y-1">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded hover:bg-vscode-list-hoverBackground">
                <span className="truncate">{c.label}</span>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => onTest(c.id)} className="text-xs opacity-60 hover:opacity-100">Test</button>
                  <button onClick={() => onRemove(c.id)} className="text-xs opacity-60 hover:opacity-100 text-red-400">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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
