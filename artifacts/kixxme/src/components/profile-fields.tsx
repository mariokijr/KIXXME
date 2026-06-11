import React from "react";
import { ChevronDown } from "lucide-react";

// Small labelled-field primitives shared by "Mi perfil" and the mandatory
// onboarding profile step so both render identical inputs.

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-display text-base tracking-widest text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  testId?: string;
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-border/60 focus-visible:ring-primary focus-visible:border-primary focus-visible:outline-none font-sans bg-input/40 text-sm px-3 pr-9 appearance-none text-foreground"
          data-testid={testId}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
      </div>
    </Field>
  );
}
