export type PropertySearch = { name: string, value: string | number | Array<string> | Array<number> | Function, cacheName?: string }

export interface OnInitEntity {
  onInit(): void;
}

export class ListController<M extends object> {

  private static readonly QUANTITY_PAGE_PER_LOT = 5;

  private modelClass: new () => M;

  private _total = 0;
  private _totalPage: number;

  private _currentPage: number;

  private _visiblePages: number[];

  private _list: M[];
  private _currentList: M[];
  private _originalList: M[];

  private _filterCacheByKeyword = {};

  private _onChangePage: (page: number) => void;

  private _onFilter: (props: PropertySearch[]) => void;

  private _rowPerPage: number;

  static normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  static isEqual = (s1, s2) => ListController.normalize(s1) === ListController.normalize(s2);
  static contain = (s1, s2) => ListController.normalize(s1).indexOf(ListController.normalize(s2)) > -1;

  private data = {};

  constructor(model: new () => M, rowPerPage: number = 10) {

    this.modelClass = model;
    this.onChangePage = null;
    this.onFilter = null;
    this._rowPerPage = rowPerPage;

    return this;
  }

  get currentList(): Array<M> {
    return this._currentList;
  }

  get currentPage(): number {
    return this._currentPage;
  }

  get totalPage(): number {
    return this._totalPage;
  }

  get total(): number {
    return this._total;
  }

  get visiblePages(): Array<number> {
    return this._visiblePages;
  }

  get firstVisiblePage(): number {
    return this.visiblePages ? this.visiblePages[0] : 0;
  }

  get lastVisiblePage(): number {
    return this.visiblePages ? this.visiblePages[this.visiblePages.length - 1] : 0;
  }

  get isFiltered(): boolean {
    return this._originalList !== this.list;
  }

  get onChangePage(): (page: number) => void {
    return this._onChangePage;
  }

  set onChangePage(callback: (page: number) => void) {
    this._onChangePage = (page: number) => {
      this._currentPage = page;
      if (callback) {
        callback.call(this, page);
      } else {
        this.setPage(page);
      }
    };
  }

  get onFilter(): (props: PropertySearch[]) => void {
    return this._onFilter;
  }

  set onFilter(callback: (props: PropertySearch[]) => void) {
    this._onFilter = (props: PropertySearch[]) => {
      if (callback) {
        callback.call(this, props);
      } else {
        this.search(props);
      }
    };
  }

  get list(): Array<M> {
    return this._list;
  }

  set list(list: Array<M>) {
    this._originalList = list;
    this._filterCacheByKeyword = {};
    this._currentPage = 1;

    if (list) {
      this._total = list.length;
    } else {
      this._total = 0;
    }

    this.updateList(list);
  }

  getData<T>(name: string): T {
    return this.data[name];
  }

  setData(name: string, value: any): void {
    this.data[name] = value;
  }

  setPage(page: number): ListController<M> {
    page = isNaN(page) ? 1 : page;

    const inicio = page * this._rowPerPage - this._rowPerPage;
    const fim = this._rowPerPage ? inicio + this._rowPerPage : this._list.length;

    this._currentList = this._list.slice(inicio, fim);

    for (let i = -1, s = this._currentList.length; ++i < s;) {
      const o = this._currentList[i];
      if (!(o instanceof this.modelClass)) {
        this._currentList[i] = this.get(this._originalList.indexOf(o));
      }
    }

    if (page > 1 && this._currentList.length === 0) {
      this.previous();
    } else {
      this._onChangePage(page);
    }

    this._currentPage = page;

    return this;
  }

  search(props: PropertySearch[], identicalSearch = true): ListController<M> {
    let list: M[];

    list = this._originalList
    if (props && props.length > 0) {
      let refCache = '';

      for (let i = -1, s = props.length; ++i < s;) {
        const prop = props[i];
        const valueIsFnc = typeof prop.value === 'function';
        if (prop.value === undefined || prop.value === null || prop.value === '' ||
          Array.isArray(prop.value) && prop.value.length === 0 ||
          valueIsFnc && typeof prop.cacheName === 'string' && prop.cacheName.trim() === '') {
          props.splice(i, 1);
          --i;
          --s
          continue;
        }

        let refName = prop.value;
        if (typeof prop.value === 'string') {
          prop.value = ListController.normalize(prop.value);
        } else if (Array.isArray(prop.value)) {
          for (let b = -1, ss = prop.value.length; ++b < ss;) {
            const value = prop.value[b];
            if (typeof value === 'string')
              prop.value[b] = ListController.normalize(value);
          }
        } else if (valueIsFnc) {
          if (prop.cacheName === undefined || prop.cacheName === null) {
            throw new Error(`The value of ${prop.name} is of type function, so it defines a cacheName to reference in the ${this.modelClass.prototype.constructor.name} list.`);
          }

          refName = prop.cacheName;
        }

        refCache += refName + '#|#'
      }

      if (refCache) {
        const filterCached = this._filterCacheByKeyword[refCache];
        if (filterCached) {
          list = filterCached;
        } else {
          list = this._filterCacheByKeyword[refCache] = [];

          const normalizedPropName = '$normalized.';
          for (let i = -1, s = this._originalList.length; ++i < s;) {
            const entity = this.get(i);

            let cnt = 0;
            for (const prop of props) {
              let originalValue;
              if (prop.name.indexOf('.') > -1) {
                originalValue = entity;
                for (const name of prop.name.split('.')) {
                  if (!originalValue) break;
                  originalValue = originalValue[name];
                }
              } else originalValue = entity[prop.name];
              if (!originalValue) continue;

              let v = entity[normalizedPropName + prop.name];
              if (v === undefined) {
                v = originalValue;
                if (typeof originalValue === 'string') {
                  v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                }
                entity[normalizedPropName + prop.name] = v;
              }

              if (typeof prop.value === 'function') {
                if (prop.value(entity)) ++cnt;
              } else {
                let values: any[];
                if (Array.isArray(prop.value)) {
                  values = prop.value;
                } else values = [prop.value];

                for (const value of values) {
                  if (typeof v === 'string' && v.indexOf(value) > -1 || v == value) {
                    ++cnt;
                    break;
                  }
                }
              }
            }

            if (!identicalSearch && cnt > 0 || props.length === cnt) list.push(entity);
          }
        }
      }
    }

    this._total = list.length;
    this._visiblePages = undefined;
    this._currentPage = 1;

    this.updateList(list);

    return this;
  }

  remove(o: M): boolean {
    const index = this._originalList.indexOf(o);
    if (index === -1) return false;

    const filterReference = o['$filterReference'];
    if (filterReference) {
      for (const key in filterReference) {
        const filterList = this._filterCacheByKeyword[key];
        filterList?.splice(filterList?.indexOf(filterReference[key]), 1);
      }
      delete o['$filterReference'];
    }

    this._originalList.splice(index, 1);

    this._total = this.list.length;

    this.updateList(this._originalList);

    return true;
  }

  previous(): void {
    if (this._currentPage > 1) {
      if (this._currentPage === this.firstVisiblePage) {
        this.previousPages();
      } else {
        this._onChangePage(this._currentPage - 1);
      }
    }
  }

  previousPages(): void {
    if (this.firstVisiblePage > 1) {
      this.generateVisiblePages(false);
      this.onChangePage(this.lastVisiblePage);
    }
  }

  next(): void {
    if (this._currentPage < this._totalPage) {
      if (this._currentPage === this.lastVisiblePage) {
        this.nextPages();
      } else {
        this._onChangePage(this._currentPage + 1);
      }
    }
  }

  nextPages(): void {
    this._nextPages(true);
  }

  clean(): ListController<M> {
    this.list = undefined;
    this._filterCacheByKeyword = {};

    this._total = 0;

    return this;
  }

  private get(i: number): M {
    let o = this._originalList[i];
    if (!(o instanceof this.modelClass)) {
      o = Object.assign(new this.modelClass, o);
      if ((o as any).onInit) (o as any).onInit();

      this._originalList[i] = o;
    }

    return o;
  }

  private _nextPages(setCurrentPage: boolean): void {
    if (this.lastVisiblePage < this._totalPage) {
      this.generateVisiblePages(true);
      if (setCurrentPage) {
        this.onChangePage(this.firstVisiblePage);
      }
    }
  }

  private async updateList(list: Array<M>): Promise<void> {
    this._list = list;
    this._visiblePages = undefined;

    if (!list || list.length === 0) {
      this._currentList = null;
      this._totalPage = 0;
      return;
    }

    if (this._rowPerPage) {
      this._totalPage = Math.ceil(list.length / this._rowPerPage);

      if (this.currentPage < 1) {
        this._currentPage = 1;
      } else if (this.currentPage > this._totalPage) {
        this._currentPage = this._totalPage;
      }
    } else {
      this._totalPage = 1;
      this._currentPage = 1;
    }

    this.setPage(this.currentPage);

    this.generateVisiblePages();

    if (this.visiblePages.length > 0) {
      while (this.visiblePages.indexOf(this.currentPage) === -1) {
        this._nextPages(false);
      }
    }
  }

  private generateVisiblePages(next?: boolean): void {
    if (this._totalPage < 1) return null;

    const pageListLength = new Array(this._totalPage).length;

    let min, max;
    if (this._visiblePages === undefined) {
      min = 1;
      max = ListController.QUANTITY_PAGE_PER_LOT;
      if (max > pageListLength) {
        max = pageListLength;
      }
    } else {
      const listLength = this._visiblePages.length,
        n = this._visiblePages[listLength - 1];

      if (next) {
        min = n + 1;
        max = n + ListController.QUANTITY_PAGE_PER_LOT;
        if (max > pageListLength) {
          max = pageListLength;
        }
      } else {
        max = n - listLength;
        min = max - ListController.QUANTITY_PAGE_PER_LOT + 1;
        if (min < 1) {
          min = 1;
        }
      }
    }

    this._visiblePages = [];
    for (let i = min - 1; ++i <= max;) {
      this._visiblePages.push(i);
    }
  }

}
