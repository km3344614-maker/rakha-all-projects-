import { useRef } from 'react';

export default function ModalBackdrop({ className, onDismiss, children, ...rest }) {
  const pressedOnBackdrop = useRef(false);

  return (
    <div
      className={className}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) onDismiss?.();
        pressedOnBackdrop.current = false;
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
