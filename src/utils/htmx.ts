import ejs from 'ejs';

export async function sendError(error: any, res: any) {
  if (error.errors) {
    error = error.errors[0];
  }
  const rend = await ejs.renderFile(
    `src/views/partials/error.ejs`, {error},
    { root: 'src/views/' });
  res.send(rend);
}

export async function sendTemplate(ctx: any, template: string, res: any) {
  const rend = await ejs.renderFile(
    `src/views/${template}.ejs`, ctx,
    { root: 'src/views/' });
  res.send(rend);
}

export async function sendTemplateInner(id: string, ctx: any, template: string, res: any, swap = "innerHtml") {
  const rend = await ejs.renderFile(
    `src/views/${template}.ejs`, ctx,
    { root: 'src/views/' });
  res.send(`<div id="${id}" hx-swap-oob="${swap}">${rend}</div>`);
}

export function varyReply(ctx: any, template: string, req: any, res: any) {
  if (req.headers['hx-request'] === 'true') {
    res.render(template, ctx);
  } else {
    res.json(ctx);
  }
}
