import { IconButton, SvgIcon, Tooltip } from '@mui/material';

interface StarButtonProps {
  disabled?: boolean;
  isStarred: boolean;
  itemName?: string;
  onToggle: () => void;
  size?: 'small' | 'medium';
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <SvgIcon fontSize="inherit" viewBox="0 0 24 24">
      <path
        d="m12 2.9 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.1l-5.56 2.92 1.06-6.2L3 9.43l6.22-.9L12 2.9z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={filled ? 0 : 1.8}
      />
    </SvgIcon>
  );
}

export function StarButton({
  disabled = false,
  isStarred,
  itemName,
  onToggle,
  size = 'small',
}: StarButtonProps) {
  const action = isStarred ? 'Remove star' : 'Star';
  const label = itemName ? `${action} ${itemName}` : action;

  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          aria-label={label}
          color={isStarred ? 'warning' : 'default'}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          size={size}
          sx={{
            border: 1,
            borderColor: isStarred ? 'warning.main' : 'divider',
            borderRadius: 1.5,
            flexShrink: 0,
            height: size === 'small' ? 32 : 40,
            width: size === 'small' ? 32 : 40,
          }}
        >
          <StarIcon filled={isStarred} />
        </IconButton>
      </span>
    </Tooltip>
  );
}
