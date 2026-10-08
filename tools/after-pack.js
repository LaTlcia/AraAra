// electron-builder afterPack：
// - win32：在 macOS 上交叉编译时没有 wine/rcedit，用纯 JS 的 resedit 给 exe 写入图标和版本信息
// - darwin：没有开发者证书，给整个 .app 做 ad-hoc 签名，否则 Apple Silicon 上会提示「已损坏」
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function adhocSign(context) {
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  console.log(`  • afterPack: ad-hoc 签名完成 → ${path.basename(app)}`);
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName === "darwin") return adhocSign(context);
  if (context.electronPlatformName !== "win32") return;
  const ResEdit = await import("resedit");
  const { appInfo } = context.packager;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);

  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, "..", "build", "icon.ico")));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, iconFile.icons.map((i) => i.data));

  const versions = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = versions[0] || ResEdit.Resource.VersionInfo.createEmpty();
  const [major, minor, patch] = appInfo.version.split(".").map(Number);
  vi.setFileVersion(major, minor, patch, 0, 1033);
  vi.setProductVersion(major, minor, patch, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: appInfo.productName,
    ProductName: appInfo.productName,
    CompanyName: "latlcia",
    OriginalFilename: `${appInfo.productFilename}.exe`,
    InternalName: appInfo.productFilename,
    LegalCopyright: "Fan-made, non-commercial",
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • afterPack: 已写入图标和版本信息 → ${path.basename(exePath)}`);
};
