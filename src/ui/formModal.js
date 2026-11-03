// Hộp thoại biểu mẫu khai báo theo danh sách trường: dùng cho chương trình, thông báo, kinh phí, tài liệu, Ban, lời mời...
import { html, raw, options, openModal, run, showFieldErrors, errSlot, formData } from './kit.js';
import { ValidationError } from '../domain/validation.js';

const fieldsOf = (e) => (e instanceof ValidationError ? e.fields : e?.cause instanceof ValidationError ? e.cause.fields : null);

function control(f, v) {
  const id = `ff_${f.name}`;
  const common = `id="${id}" name="${f.name}"`;
  switch (f.type) {
    case 'textarea':
      return html`<textarea class="input" autocomplete="off" ${raw(common)} rows="${f.rows || 3}" maxlength="${f.max || 5000}" placeholder="${f.placeholder || ''}">${v ?? ''}</textarea>`;
    case 'select':
      return html`<select class="input" ${raw(common)}>${options(f.options, v ?? '', f.empty !== undefined ? { empty: f.empty } : {})}</select>`;
    case 'multiselect':
      return html`<select class="input" ${raw(common)} multiple size="${Math.min(5, f.options.length || 1)}">${f.options.map((o) => html`<option value="${o.v}" ${(v || []).includes(o.v) ? raw('selected') : ''}>${o.l}</option>`)}</select>`;
    case 'checkbox':
      return html`<label class="checkline"><input type="checkbox" ${raw(common)} ${v ? raw('checked') : ''} /> ${f.label}</label>`;
    default:
      return html`<input class="input" autocomplete="off" ${raw(common)} type="${f.type || 'text'}" value="${v ?? ''}" maxlength="${f.max || 300}" placeholder="${f.placeholder || ''}" ${f.inputmode ? raw(`inputmode="${f.inputmode}"`) : ''} ${f.disabled ? 'disabled' : ''} />`;
  }
}

/**
 * @param {{title:string, fields:object[], values?:object, submitLabel?:string, ok?:string, onSubmit:(data:object)=>Promise<void>, extraFooter?:any, intro?:any}} cfg
 */
export function openForm(cfg) {
  const v = cfg.values || {};
  const m = openModal({
    title: cfg.title,
    wide: cfg.wide,
    body: html`${cfg.intro || ''}<form id="genForm" novalidate><div class="formgrid">${cfg.fields.map((f) =>
      f.type === 'checkbox'
        ? html`<div class="field full">${control(f, v[f.name])}${errSlot(f.name)}</div>`
        : html`<div class="field ${f.full ? 'full' : ''}"><label for="ff_${f.name}">${f.label}${f.required ? ' *' : ''}</label>${control(f, v[f.name])}${f.hint ? html`<div class="hint">${f.hint}</div>` : ''}${errSlot(f.name)}</div>`,
    )}</div></form>`,
    footer: html`${cfg.extraFooter || ''}<button class="btn" data-no>Hủy</button><button class="btn primary" data-yes>${cfg.submitLabel || 'Lưu'}</button>`,
  });
  const form = m.el.querySelector('#genForm');
  const submit = () =>
    run(
      m.el.querySelector('[data-yes]'),
      async () => {
        await cfg.onSubmit(formData(form));
        m.close();
      },
      {
        ok: cfg.ok || 'Đã lưu.',
        onError: (e) => {
          const f = fieldsOf(e);
          if (f) {
            showFieldErrors(form, f);
            return true;
          }
          return false;
        },
      },
    );
  m.el.querySelector('[data-no]').addEventListener('click', () => m.close());
  m.el.querySelector('[data-yes]').addEventListener('click', submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  return m;
}
