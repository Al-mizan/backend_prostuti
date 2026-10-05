import { IqueryParams } from "../interface/query.interface";

interface QueryBuilderConfig {
  searchableFields?: string[];
  filterableFields?: string[];
}

export class QueryBuilder<
  TModel,
  TWhereInput extends Record<string, any> = Record<string, any>,
  TInclude extends Record<string, any> = Record<string, any>,
> {
  private model: any;
  private query: IqueryParams;
  private config: QueryBuilderConfig;
  private whereConditions: Record<string, any> = {};
  private includeConfig: Record<string, any> = {};
  private selectFields?: Record<string, boolean>;
  private pageNumber: number = 1;
  private limitNumber: number = 10;
  private orderByConfig: Record<string, any> = { createdAt: "desc" };

  constructor(
    model: any,
    query: IqueryParams = {},
    config: QueryBuilderConfig = {}
  ) {
    this.model = model;
    this.query = query;
    this.config = config;
  }

  public search(): this {
    const searchTerm = this.query.searchTerm;
    const searchableFields = this.config.searchableFields || [];

    if (searchTerm && typeof searchTerm === "string" && searchableFields.length > 0) {
      const orConditions = searchableFields.map((field) => {
        const parts = field.split(".");
        if (parts.length === 1) {
          return {
            [parts[0]]: {
              contains: searchTerm,
              mode: "insensitive",
            },
          };
        } else if (parts.length === 2) {
          return {
            [parts[0]]: {
              [parts[1]]: {
                contains: searchTerm,
                mode: "insensitive",
              },
            },
          };
        } else if (parts.length === 3) {
          return {
            [parts[0]]: {
              [parts[1]]: {
                [parts[2]]: {
                  contains: searchTerm,
                  mode: "insensitive",
                },
              },
            },
          };
        }
        return {
          [field]: {
            contains: searchTerm,
            mode: "insensitive",
          },
        };
      });

      this.whereConditions = {
        ...this.whereConditions,
        OR: orConditions,
      };
    }

    return this;
  }

  public filter(): this {
    const filterableFields = this.config.filterableFields || [];
    const queryObj = { ...this.query };
    const excludeFields = [
      "searchTerm",
      "page",
      "limit",
      "sortBy",
      "sortOrder",
      "fields",
      "include",
    ];

    excludeFields.forEach((field) => delete queryObj[field]);

    const filterConditions: Record<string, any> = {};

    for (const [key, value] of Object.entries(queryObj)) {
      if (!filterableFields.includes(key)) continue;

      if (typeof value === "object" && value !== null) {
        // Range operators like { gte: 10, lte: 50 }
        const rangeFilter: Record<string, any> = {};
        for (const [op, val] of Object.entries(value)) {
          if (["lt", "lte", "gt", "gte"].includes(op)) {
            const num = Number(val);
            rangeFilter[op] = !isNaN(num) ? num : val;
          }
        }
        if (Object.keys(rangeFilter).length > 0) {
          filterConditions[key] = rangeFilter;
        }
      } else if (value !== undefined && value !== "") {
        if (key.includes(".")) {
          const parts = key.split(".");
          if (parts.length === 2) {
            filterConditions[parts[0]] = {
              ...(filterConditions[parts[0]] || {}),
              [parts[1]]: value,
            };
          }
        } else {
          filterConditions[key] = value;
        }
      }
    }

    this.whereConditions = {
      ...this.whereConditions,
      ...filterConditions,
    };

    return this;
  }

  public where(conditions: TWhereInput): this {
    this.whereConditions = {
      ...this.whereConditions,
      ...conditions,
    };
    return this;
  }

  public include(staticInclude: TInclude): this {
    this.includeConfig = {
      ...this.includeConfig,
      ...staticInclude,
    };
    return this;
  }

  public dynamicInclude(mapping: Record<string, any>): this {
    if (this.query.include && typeof this.query.include === "string") {
      const requested = this.query.include.split(",").map((s) => s.trim());
      for (const req of requested) {
        if (mapping[req]) {
          this.includeConfig[req] = mapping[req];
        }
      }
    }
    return this;
  }

  public paginate(): this {
    const page = Math.max(1, Number(this.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(this.query.limit) || 10));
    this.pageNumber = page;
    this.limitNumber = limit;
    return this;
  }

  public sort(): this {
    if (this.query.sortBy && typeof this.query.sortBy === "string") {
      const order = this.query.sortOrder === "asc" ? "asc" : "desc";
      const parts = this.query.sortBy.split(".");
      if (parts.length === 1) {
        this.orderByConfig = { [parts[0]]: order };
      } else if (parts.length === 2) {
        this.orderByConfig = { [parts[0]]: { [parts[1]]: order } };
      }
    }
    return this;
  }

  public fields(): this {
    if (this.query.fields && typeof this.query.fields === "string") {
      const fieldsList = this.query.fields.split(",").map((f) => f.trim());
      const select: Record<string, boolean> = {};
      for (const f of fieldsList) {
        if (f) select[f] = true;
      }
      if (Object.keys(select).length > 0) {
        this.selectFields = select;
      }
    }
    return this;
  }

  public async execute(): Promise<{
    data: TModel[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const skip = (this.pageNumber - 1) * this.limitNumber;
    const take = this.limitNumber;

    const findArgs: any = {
      where: this.whereConditions,
      skip,
      take,
      orderBy: this.orderByConfig,
    };

    if (this.selectFields) {
      findArgs.select = this.selectFields;
    } else if (Object.keys(this.includeConfig).length > 0) {
      findArgs.include = this.includeConfig;
    }

    const [total, data] = await Promise.all([
      this.model.count({ where: this.whereConditions }),
      this.model.findMany(findArgs),
    ]);

    const totalPages = Math.ceil(total / this.limitNumber) || 1;

    return {
      data,
      meta: {
        page: this.pageNumber,
        limit: this.limitNumber,
        total,
        totalPages,
      },
    };
  }
}
