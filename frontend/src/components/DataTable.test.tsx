import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "./DataTable";
import type { Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [
  { key: "name", header: "Name", render: (r) => r.name },
];

const rows: Row[] = [
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
];

describe("DataTable", () => {
  it("renders column headers and row data", () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={2}
        page={1}
        pageSize={20}
        onPageChange={vi.fn()}
        getRowKey={(r) => r.id}
      />
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows loading spinner when isLoading is true", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        isLoading
        total={0}
        page={1}
        pageSize={20}
        onPageChange={vi.fn()}
        getRowKey={(r) => r.id}
      />
    );
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("shows empty message when data is empty", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        total={0}
        page={1}
        pageSize={20}
        onPageChange={vi.fn()}
        emptyMessage="Nothing here."
        getRowKey={(r) => r.id}
      />
    );
    expect(screen.getByText("Nothing here.")).toBeInTheDocument();
  });

  it("shows pagination controls when total > 0", () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={40}
        page={1}
        pageSize={20}
        onPageChange={vi.fn()}
        getRowKey={(r) => r.id}
      />
    );
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).toBeEnabled();
  });

  it("calls onPageChange with next page number", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={40}
        page={1}
        pageSize={20}
        onPageChange={onPageChange}
        getRowKey={(r) => r.id}
      />
    );
    await user.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with previous page number", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={40}
        page={2}
        pageSize={20}
        onPageChange={onPageChange}
        getRowKey={(r) => r.id}
      />
    );
    await user.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables next button on the last page", () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        total={40}
        page={2}
        pageSize={20}
        onPageChange={vi.fn()}
        getRowKey={(r) => r.id}
      />
    );
    expect(screen.getByLabelText("Next page")).toBeDisabled();
    expect(screen.getByLabelText("Previous page")).toBeEnabled();
  });
});
