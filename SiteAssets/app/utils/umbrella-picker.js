import { ComboBox, FormField, __lodash } from '../libs/nofbiz/nofbiz.base.js'
import { LIST_PROGRAMS, LIST_PROJECTS } from './constants.js'
import { filterProgramsByAccess, filterProjectsByAccess } from './access-control.js'

// ============================================================
// fetchUmbrellaOptions
// ============================================================

/**
 * Perform a server-side Contains search on Title across Programs and Projects,
 * then filter by the caller's access rights.
 *
 * @param {string} query - The search string typed by the user.
 * @param {{ siteApi: object, userEmail: string, siteAccessLevel: string|null, delegations: object[], userScopes: Set<string>, excludeUuid?: string }} ctx
 * @returns {Promise<Array<{ label: string, value: string }>>}
 */
export async function fetchUmbrellaOptions(query, ctx) {
  const q = (query || '').trim()
  if (!q) return []

  const camlQ = { Title: { value: q, operator: 'Contains' } }

  try {
    const [programs, projects] = await Promise.all([
      ctx.siteApi.list(LIST_PROGRAMS).getItems(camlQ),
      ctx.siteApi.list(LIST_PROJECTS).getItems(camlQ),
    ])

    const visPrograms = filterProgramsByAccess(programs, ctx.userEmail, ctx.siteAccessLevel, ctx.userScopes)
    const visProjects = filterProjectsByAccess(projects, ctx.userEmail, ctx.siteAccessLevel, ctx.delegations, ctx.userScopes)

    const programOptions = visPrograms
      .filter(p => !ctx.excludeUuid || p.UUID !== ctx.excludeUuid)
      .map(p => ({ label: '[Program] ' + p.Title, value: p.UUID }))

    const projectOptions = visProjects
      .filter(p => !ctx.excludeUuid || p.UUID !== ctx.excludeUuid)
      .map(p => ({ label: '[Project] ' + p.Title, value: p.UUID }))

    return [...programOptions, ...projectOptions]
  } catch (err) {
    console.error('[fetchUmbrellaOptions] failed', { query, err })
    return []
  }
}

// ============================================================
// UmbrellaComboBox — subclass of ComboBox
// Mirrors PeoplePicker: overrides _onSearchEventListeners so that
// fetched options land in this._dataset (not just this._filteredDataset),
// which ensures selection + display + FormField value all work correctly.
// ============================================================

class UmbrellaComboBox extends ComboBox {
  /**
   * @param {FormField} formField
   * @param {{ siteApi: object, userEmail: string, siteAccessLevel: string|null, delegations: object[], userScopes: Set<string>, excludeUuid?: string, placeholder?: string, debounceMs?: number, minimumCharacters?: number }} opts
   */
  constructor(formField, opts) {
    const {
      siteApi,
      userEmail,
      siteAccessLevel,
      delegations,
      userScopes,
      excludeUuid,
      placeholder = 'Search programs & projects…',
      debounceMs = 300,
      minimumCharacters = 1,
      isDisabled = false,
    } = opts

    // Empty initial dataset — allowCreate is false so the user can only pick
    // existing items found by search. Pass isDisabled so ComboBox sets
    // _explicitlyDisabled = true and the FormControl base sets _isDisabled = true.
    super(formField, [], { allowFiltering: true, placeholder, isDisabled })

    // When not explicitly disabled, PeoplePicker (and this class) override the
    // empty-dataset auto-disable so the control stays enabled — the user needs
    // to type to populate it. When explicitly disabled, leave _isDisabled as-is.
    if (!isDisabled) this._isDisabled = false

    this._minimumCharacters = minimumCharacters
    this._ctx = { siteApi, userEmail, siteAccessLevel, delegations, userScopes, excludeUuid }
    this._debouncedSearch = __lodash.debounce((q) => this._executeSearch(q), debounceMs)
  }

  // Identify as a ComboBox for BEM/CSS purposes. The base derives the name from
  // `new.target.name` -> 'umbrellacombobox', which has no stylesheet, so the
  // control would render unstyled and _displaySelection would target the wrong
  // element. Returning 'combobox' makes all ComboBox CSS (app + SPARC) apply.
  // This getter is live during super() (prototype getter), so the class string
  // and topClassBEM both resolve to nofbiz__combobox.
  get name() {
    return 'combobox'
  }

  // -- Search --

  async _executeSearch(query) {
    const seq = ++this._searchSeq
    this._setLoading(true)

    try {
      const opts = await fetchUmbrellaOptions(query, this._ctx)

      if (!this.isAlive || seq !== this._searchSeq) return

      // Set BOTH _dataset and _filteredDataset so that selection, display, and
      // FormField value capture all work after the user picks an option.
      this._dataset = opts
      this._filteredDataset = opts
    } catch (err) {
      if (!this.isAlive || seq !== this._searchSeq) return
      console.error('[UmbrellaComboBox] fetch failed', { query, err })
      this._dataset = []
      this._filteredDataset = []
      this._hasError = true
    } finally {
      if (this.isAlive && seq === this._searchSeq) {
        this._isLoading = false
        this._refreshDropdownList()
      }
    }
  }

  // -- Event listeners --

  _onSearchEventListeners() {
    const input = this.instance?.find(`.${this.topClassBEM}__searchbar input`)

    input?.on('keyup', (e) => {
      const event = e.originalEvent

      // Only react to printable characters, Backspace, and Delete
      if (!event?.key.match(/^[\w\s]$/) && event?.key !== 'Backspace' && event?.key !== 'Delete') return

      const value = input.val()?.toString() || ''

      if (value.length >= this._minimumCharacters) {
        // Show loading immediately during the debounce gap
        this._setLoading(true)
        this._debouncedSearch(value)
      } else {
        this._debouncedSearch.cancel()
        this._dataset = []
        this._filteredDataset = []
        this._isLoading = false
        this._refreshDropdownList()
      }
    })
  }

  // -- Empty-state hint --

  _emptyMessage() {
    const input = this.instance?.find(`.${this.topClassBEM}__searchbar__input`)
    const len = input?.val()?.toString().length ?? 0

    if (len === 0) return 'Type to search programs &amp; projects'
    if (len < this._minimumCharacters) return `Type at least ${this._minimumCharacters} character${this._minimumCharacters !== 1 ? 's' : ''}`
    return super._emptyMessage()
  }

  // -- Lifecycle --

  remove() {
    this._debouncedSearch.cancel()
    super.remove()
  }
}

// ============================================================
// Public factory
// ============================================================

/**
 * Create an async UmbrellaComboBox that fetches matching programs and projects
 * from SharePoint as the user types.
 *
 * @param {FormField} formField
 * @param {{ siteApi: object, userEmail: string, siteAccessLevel: string|null, delegations: object[], userScopes: Set<string>, excludeUuid?: string }} ctx
 * @param {{ placeholder?: string }} [opts]
 * @returns {UmbrellaComboBox}
 */
export function createUmbrellaPicker(formField, ctx, { placeholder = 'Search programs & projects…', isDisabled = false } = {}) {
  return new UmbrellaComboBox(formField, { ...ctx, placeholder, isDisabled })
}

/**
 * Seed a UmbrellaComboBox with the item's current parent so the existing
 * selection is shown without requiring the user to type a search first.
 *
 * Uses the public `dataset` setter (from ComboBox) which syncs checked-state
 * from the current FormField value and triggers a re-render.
 *
 * @param {UmbrellaComboBox} picker
 * @param {FormField} formField
 * @param {{ label: string, value: string }|null} option
 */
export function seedUmbrellaCurrent(picker, formField, option) {
  if (!option) {
    // No stored parent: clear the display. clearSelection unchecks all items,
    // resets the input text, and sets the FormField value to null without calling
    // _disableOnEmptyDataset, so the picker stays enabled and ready for input.
    picker.clearSelection()
    return
  }
  // Set the FormField first so the dataset setter finds the value and marks
  // the option as checked.
  formField.value = option
  // The public dataset setter normalises the array, syncs checked state from
  // the FormField value, and calls render() — the selection appears.
  picker.dataset = [option]
}
