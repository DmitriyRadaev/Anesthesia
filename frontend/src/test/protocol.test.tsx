import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { YesNo } from "../pages/protocol/common"
import { makeUser, mockApi, renderApp } from "./utils"

function YesNoHarness() {
  const [value, setValue] = useState<boolean | null>(null)
  return (
    <>
      <YesNo label="Аллергия" value={value} onChange={setValue} />
      <output>{String(value)}</output>
    </>
  )
}

describe("протокол анестезии", () => {
  it("плитки Да/Нет выбираются щелчком, повторный щелчок снимает выбор", async () => {
    render(<YesNoHarness />)
    const yes = screen.getByRole("radio", { name: "Да" })
    await userEvent.click(yes)
    expect(yes).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("true")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("radio", { name: "Нет" }))
    expect(screen.getByText("false")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("radio", { name: "Нет" }))
    expect(screen.getByText("null")).toBeInTheDocument()
  })

  it("разделы протокола и блок «Введенные препараты» с суммарными дозами из карты", async () => {
    const doctor = makeUser()
    mockApi((url) => {
      if (url.pathname === "/api/auth/me/") return { body: doctor }
      if (url.pathname === "/api/operations/5/card/drugs/totals/") return { body: [{ drug: "Пропофол", dose: 200, unit: "mg", text: "200 mg" }] }
      if (url.pathname.startsWith("/api/catalogs/")) return { body: [] }
      return undefined
    })
    renderApp("/operations/5/protocol", doctor)
    for (const title of ["Сведения о пациенте", "Премедикация", "Введение в анестезию", "Поддержание анестезии", "Направление пациента"]) {
      expect(await screen.findByRole("button", { name: title })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole("button", { name: "Введенные препараты" }))
    expect(await screen.findByText("Пропофол")).toBeInTheDocument()
    expect(screen.getByText("200 mg")).toBeInTheDocument()
  })
})
