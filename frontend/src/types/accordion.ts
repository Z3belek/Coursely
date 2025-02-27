export type AccordionItemProps = {
  title: string
  children: React.ReactNode
  itemKey: string
  ariaLabel?: string
};

export type AccordionContextType = {
  openKey: string | null
  setOpenKey: (key: string | null) => void
}

export type AccordionProps = {
  children: React.ReactNode
  defaultSelectedKeys?: string[]
}