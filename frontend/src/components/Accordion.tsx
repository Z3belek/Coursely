"use client"
import { AccordionContextType, AccordionItemProps, AccordionProps } from "@/types"
import { useState, createContext, useContext, FC, useEffect } from "react"

const AccordionContext = createContext<AccordionContextType | undefined>(undefined)

export const Accordion: FC<AccordionProps> = ({ children, defaultSelectedKeys = [] }) => {
  const [openKey, setOpenKey] = useState<string | null>(defaultSelectedKeys[0] || null)

  useEffect(() => {
    if (defaultSelectedKeys.length > 0) {
      setOpenKey(defaultSelectedKeys[0])
    }
  }, [defaultSelectedKeys])

  return (
    <AccordionContext.Provider value={{ openKey, setOpenKey }}>
      <div className="w-full max-w-2xl mx-auto">{children}</div>
    </AccordionContext.Provider>
  )
}

export const AccordionItem: React.FC<AccordionItemProps> = ({ title, children, itemKey, ariaLabel }) => {
  const context = useContext(AccordionContext)
  if (!context) {
    throw new Error("AccordionItem must be used within an Accordion")
  }
  const { openKey, setOpenKey } = context

  const isOpen = itemKey === openKey

  const handleClick = () => {
    setOpenKey(isOpen ? null : itemKey)
  }

  return (
    <div className="border border-gray-200 rounded-md mb-2">
      <button
        className="flex justify-between items-center w-full p-4 text-left bg-gray-100 hover:bg-gray-200 transition-colors duration-300 ease-in-out"
        onClick={handleClick}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        <span className="font-medium">{title}</span>
        <span className={`transform transition-transform duration-300 ease-in-out ${isOpen ? "rotate-90" : ""}`}>
          &#9656;
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  )
}