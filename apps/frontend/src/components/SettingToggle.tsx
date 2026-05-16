interface Props {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  tooltip?: string;
  children?: React.ReactNode;
}

export function SettingToggle({
  label,
  checked,
  onChange,
  disabled = false,
  tooltip,
  children,
}: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          {label}
        </span>
        <div className="relative group">
          <label
            className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={onChange}
              disabled={disabled}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
          {tooltip && (
            <div className="absolute right-0 bottom-full mb-2 w-44 text-[11px] bg-inverse-surface text-inverse-on-surface px-2 py-1.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center leading-snug">
              {tooltip}
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
