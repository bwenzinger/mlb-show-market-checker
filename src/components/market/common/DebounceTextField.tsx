import { memo, useEffect, useRef, useState } from "react";
import { TextField, type TextFieldProps } from "@mui/material";

type DebounceTextFieldProps = Omit<TextFieldProps, "onChange" | "value"> & {
  debounceMs?: number;
  onDebouncedChange: (value: string) => void;
  value: string;
};

export const DebounceTextField = memo(function DebounceTextField({
  debounceMs = 300,
  onDebouncedChange,
  value,
  ...textFieldProps
}: DebounceTextFieldProps) {
  const [inputValue, setInputValue] = useState(value);
  const lastCommittedValueRef = useRef(value);

  useEffect(() => {
    if (value !== lastCommittedValueRef.current && value !== inputValue) {
      setInputValue(value);
      lastCommittedValueRef.current = value;
    }
  }, [inputValue, value]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (inputValue !== lastCommittedValueRef.current) {
        lastCommittedValueRef.current = inputValue;
        onDebouncedChange(inputValue);
      }
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [debounceMs, inputValue, onDebouncedChange]);

  return (
    <TextField
      {...textFieldProps}
      onChange={(event) => setInputValue(event.target.value)}
      value={inputValue}
    />
  );
});
