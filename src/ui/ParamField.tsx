/**
 * ParamField — one editable electrical parameter.
 *
 * Text variant: a controlled input that commits on blur / Enter / Tab. On commit
 * it parses engineering notation; valid values call onCommit, invalid values call
 * onError and leave the circuit untouched (the parent keeps the last valid value).
 *
 * Slider variant (pot wiper): an always-valid range input that commits live.
 */
import React, { useEffect, useState } from "react";
import { parseEngineering } from "./parse-eng";

interface CommonProps {
  /** Stable key used in data-testid="inspector-param-<paramKey>". */
  paramKey: string;
  label: string;
  /** True when the live value differs from the board original. */
  modified: boolean;
}

interface TextProps extends CommonProps {
  kind: "text";
  /** Canonical display string for the current value (e.g. "220", "4.7k"). */
  value: string;
  onCommit: (value: number) => void;
  /** Report a validation message (or null to clear) to the shared error slot. */
  onError: (message: string | null) => void;
}

interface SliderProps extends CommonProps {
  kind: "slider";
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}

type ParamFieldProps = TextProps | SliderProps;

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  padding: "0.15rem 0",
};

const labelStyle: React.CSSProperties = {
  color: "#8aa8c4",
  fontSize: "0.75rem",
  display: "flex",
  alignItems: "center",
  gap: "0.3rem",
};

const inputStyle: React.CSSProperties = {
  width: "6.5rem",
  background: "#06101c",
  border: "1px solid #142640",
  borderRadius: "2px",
  color: "#cfe3f2",
  fontFamily: "monospace",
  fontSize: "0.78rem",
  padding: "0.2rem 0.4rem",
  textAlign: "right",
  outline: "none",
};

function ModifiedMarker({ paramKey }: { paramKey: string }): React.ReactElement {
  return (
    <span
      data-testid={`param-modified-${paramKey}`}
      title="Modified from board default"
      aria-label="modified"
      style={{ color: "#e0c04a", fontSize: "0.7rem", lineHeight: 1 }}
    >
      ●
    </span>
  );
}

export default function ParamField(props: ParamFieldProps): React.ReactElement {
  if (props.kind === "slider") {
    return (
      <div style={row}>
        <span style={labelStyle}>
          {props.label}
          {props.modified && <ModifiedMarker paramKey={props.paramKey} />}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <input
            type="range"
            data-testid={`inspector-param-${props.paramKey}`}
            min={props.min}
            max={props.max}
            step={props.step}
            value={props.value}
            onChange={(e) => props.onCommit(Number(e.target.value))}
            style={{ width: "6.5rem" }}
          />
          <span style={{ color: "#cfe3f2", width: "2.5rem", textAlign: "right" }}>
            {props.value.toFixed(2)}
          </span>
        </span>
      </div>
    );
  }

  return <TextField {...props} />;
}

function TextField(props: TextProps): React.ReactElement {
  const { paramKey, label, modified, value, onCommit, onError } = props;
  const [draft, setDraft] = useState(value);

  // Keep the draft in sync when the committed value changes externally
  // (e.g. reset, or selecting a different part).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (): void => {
    const parsed = parseEngineering(draft);
    if (parsed === null) {
      onError(`"${draft.trim() || "(empty)"}" is not a valid value. Enter a positive number like 220, 4.7k, or 100n.`);
      return;
    }
    onError(null);
    onCommit(parsed);
  };

  return (
    <div style={row}>
      <span style={labelStyle}>
        {label}
        {modified && <ModifiedMarker paramKey={paramKey} />}
      </span>
      <input
        type="text"
        data-testid={`inspector-param-${paramKey}`}
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
        }}
        style={inputStyle}
      />
    </div>
  );
}
