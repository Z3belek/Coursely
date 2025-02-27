"use client"
import { useState } from "react"
import Modal from "./Modal"
import { ModalTriggerProps } from "@/types"

const ModalTrigger = ({ buttonText, modalTitle, children }: ModalTriggerProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const openModal = () => setIsOpen(true)
  const closeModal = () => setIsOpen(false)

  return (
    <>
      <button
        onClick={openModal}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
      >
        {buttonText}
      </button>
      <Modal isOpen={isOpen} onClose={closeModal} title={modalTitle}>
        {children}
      </Modal>
    </>
  )
}

export default ModalTrigger