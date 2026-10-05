import { describe, expect, it, vi } from "vitest";
import { QueryBuilder } from "../../src/app/utils/QueryBuilder";

describe("QueryBuilder Utility", () => {
  const mockModel = {
    count: vi.fn().mockResolvedValue(42),
    findMany: vi.fn().mockResolvedValue([{ id: "1", name: "Question 1" }]),
  };

  it("builds pagination correctly with defaults and custom params", async () => {
    const qb = new QueryBuilder(mockModel, { page: "2", limit: "15" });
    const result = await qb.paginate().execute();

    expect(mockModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 15,
        take: 15,
      })
    );
    expect(result.meta).toEqual({
      page: 2,
      limit: 15,
      total: 42,
      totalPages: 3,
    });
  });

  it("builds search conditions across multiple fields", async () => {
    const qb = new QueryBuilder(
      mockModel,
      { searchTerm: "bangladesh" },
      { searchableFields: ["title", "user.name"] }
    );
    await qb.search().execute();

    expect(mockModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { title: { contains: "bangladesh", mode: "insensitive" } },
            { user: { name: { contains: "bangladesh", mode: "insensitive" } } },
          ],
        },
      })
    );
  });

  it("builds filter conditions for whitelisted fields", async () => {
    const qb = new QueryBuilder(
      mockModel,
      { subject: "BENGALI", status: "ACTIVE", ignoredField: "drop_me" },
      { filterableFields: ["subject", "status"] }
    );
    await qb.filter().execute();

    expect(mockModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subject: "BENGALI",
          status: "ACTIVE",
        },
      })
    );
  });

  it("handles sorting and field projection", async () => {
    const qb = new QueryBuilder(mockModel, {
      sortBy: "name",
      sortOrder: "asc",
      fields: "id,name,role",
    });
    await qb.sort().fields().execute();

    expect(mockModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true },
      })
    );
  });

  it("handles dynamicInclude from client query param", async () => {
    const qb = new QueryBuilder(mockModel, { include: "user,questions" });
    const includeConfig = {
      user: true,
      questions: { select: { id: true } },
      unrelated: false,
    };

    await qb.dynamicInclude(includeConfig).execute();

    expect(mockModel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          user: true,
          questions: { select: { id: true } },
        },
      })
    );
  });
});
