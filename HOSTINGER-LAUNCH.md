# Launching LASTGAZE on Hostinger

## Upload the site

1. In Hostinger hPanel, open **Websites** and choose **Dashboard** next to `lastgaze.com`.
2. Open **File Manager** and enter the website root, usually `public_html`.
3. Upload the contents of this project into that folder. Upload the contents themselves, not a parent `lastgaze-site` folder.
4. Visit `https://lastgaze.com`. Visitors will see the custom private-preview page.

## Change the custom access code

The custom preview gate is controlled by `password` in `assets/products.js`. Change it before uploading.

```js
password: "replace-this-before-launch"
```

This is a visual launch gate for a static site. It keeps normal visitors on the private-preview page, but it is not a replacement for server authentication.

## Enable true server-side protection (recommended for a completely private site)

In hPanel, search for **Password Protect Directories**, choose the website root directory, then create a separate username and strong password. This blocks direct access to every site file at the server level.

Hostinger's server protection displays the browser's standard sign-in prompt before the custom page. Use it when privacy matters more than showing the branded preview page. Remove it when you are ready for the public release.

## Public launch checklist

1. Remove the three `noindex` meta tags.
2. Remove the small access-gate scripts from `index.html`, `shop.html`, and `product.html`.
3. Remove server-side directory protection, if enabled.
4. Replace preview product details with final prices, sizes, measurements, and shipping information.
