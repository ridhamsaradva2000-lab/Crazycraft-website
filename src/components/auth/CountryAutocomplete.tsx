"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { getData } from "country-list";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FieldError } from "@/components/ui/FormError";

interface CountryListEntry {
  code: string;
  name: string;
}

const COUNTRY_OPTIONS: CountryListEntry[] = getData() as CountryListEntry[];

let regionDisplayNames: Intl.DisplayNames | null = null;

try {
  if (typeof Intl !== "undefined" && "DisplayNames" in Intl) {
    regionDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
  }
} catch {
  regionDisplayNames = null;
}

function getDisplayLabel(option: CountryListEntry): string {
  if (!regionDisplayNames) return option.name;

  try {
    const label = regionDisplayNames.of(option.code);
    return label && label !== option.code ? label : option.name;
  } catch {
    return option.name;
  }
}

function findOptionByCanonicalName(
  name: string
): CountryListEntry | undefined {
  return COUNTRY_OPTIONS.find((option) => option.name === name);
}

function findExactOptionByQuery(
  query: string
): CountryListEntry | undefined {
  const normalized = query.trim().toLowerCase();

  if (!normalized) return undefined;

  return COUNTRY_OPTIONS.find(
    (option) =>
      option.name.toLowerCase() === normalized ||
      getDisplayLabel(option).toLowerCase() === normalized
  );
}

interface CountryAutocompleteProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
}

export function CountryAutocomplete({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  required,
}: CountryAutocompleteProps) {
  const [query, setQuery] = useState<string>(() => {
    const match = value ? findOptionByCanonicalName(value) : undefined;
    return match ? getDisplayLabel(match) : value ?? "";
  });

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();

  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const pendingInternalValue = useRef<string | null>(null);

  function commitChange(next: string) {
    pendingInternalValue.current = next;
    onChange(next);
  }

  useEffect(() => {
    if (pendingInternalValue.current === value) {
      pendingInternalValue.current = null;
      return;
    }

    pendingInternalValue.current = null;

    const match = value
      ? findOptionByCanonicalName(value)
      : undefined;

    setQuery(match ? getDisplayLabel(match) : value);
  }, [value]);

  useEffect(() => {
    if (activeIndex >= 0 && optionRefs.current[activeIndex]) {
      optionRefs.current[activeIndex]?.scrollIntoView({
        block: "nearest",
      });
    }
  }, [activeIndex]);

  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();

    if (trimmed.length < 2) return [];

    return COUNTRY_OPTIONS.filter(
      (option) =>
        option.name.toLowerCase().startsWith(trimmed) ||
        getDisplayLabel(option).toLowerCase().startsWith(trimmed)
    ).slice(0, 25);
  }, [query]);

  const showNoMatches =
    query.trim().length >= 2 &&
    suggestions.length === 0;

  function optionId(index: number) {
    return `${listboxId}-option-${index}`;
  }

  function selectOption(option: CountryListEntry) {
    setQuery(getDisplayLabel(option));
    commitChange(option.name);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const next = event.target.value;

    setQuery(next);
    setActiveIndex(-1);
    setIsOpen(next.trim().length >= 2);

    commitChange("");
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (suggestions.length === 0) return;

      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
        return;
      }

      setActiveIndex(
        (prev) => (prev + 1) % suggestions.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (suggestions.length === 0) return;

      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(suggestions.length - 1);
        return;
      }

      setActiveIndex((prev) =>
        prev <= 0
          ? suggestions.length - 1
          : prev - 1
      );
      return;
    }

    if (event.key === "Enter") {
      if (
        isOpen &&
        activeIndex >= 0 &&
        suggestions[activeIndex]
      ) {
        event.preventDefault();
        selectOption(suggestions[activeIndex]);
      }
      return;
    }

    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "Tab") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleBlur() {
    const exactMatch = findExactOptionByQuery(query);

    if (exactMatch) {
      setQuery(getDisplayLabel(exactMatch));
      commitChange(exactMatch.name);
    }

    window.setTimeout(() => {
      setIsOpen(false);
      setActiveIndex(-1);
      onBlur?.();
    }, 100);
  }

  return (
    <div className="relative">
      <Label htmlFor={id}>{label}</Label>

      <Input
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          isOpen && activeIndex >= 0
            ? optionId(activeIndex)
            : undefined
        }
        autoComplete="country-name"
        required={required}
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => {
          if (query.trim().length >= 2) {
            setIsOpen(true);
          }
        }}
      />

      {isOpen &&
        (suggestions.length > 0 || showNoMatches) && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-paper-muted bg-white font-body shadow-md"
          >
            {suggestions.map((option, index) => (
              <li
                key={option.code}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option);
                }}
                className={`cursor-pointer px-3 py-2 text-ink hover:bg-paper-muted ${
                  index === activeIndex
                    ? "bg-paper-muted"
                    : ""
                }`}
              >
                {getDisplayLabel(option)}
              </li>
            ))}

            {showNoMatches && (
              <li
                role="option"
                aria-disabled="true"
                aria-selected={false}
                className="px-3 py-2 font-body text-ink-muted"
              >
                No matching country
              </li>
            )}
          </ul>
        )}

      <FieldError message={error} />
    </div>
  );
}
