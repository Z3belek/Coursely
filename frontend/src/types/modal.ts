export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export type ModalTriggerProps = {
  buttonText: string;
  modalTitle?: string;
  children: React.ReactNode;
};