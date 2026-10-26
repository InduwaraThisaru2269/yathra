import { useState } from 'react';
import { Modal } from './ui';

/** Asks for the reason or comment a workflow move requires. */
export function PromptModal({
  title,
  label,
  placeholder,
  confirmText,
  onCancel,
  onConfirm,
}: {
  title: string;
  label: string;
  placeholder?: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn yellow" type="button" disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>
            {confirmText}
          </button>
        </>
      }
    >
      <label className="field">
        {label}
        <textarea className="textarea" autoFocus placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    </Modal>
  );
}
