import DeviceSetupPage from "./DeviceSetupPage";

/**
 * /onboarding/new-device
 *
 * المسار الأساسي لتعريف جهاز كاشير جديد. يُعيد استخدام نفس مكوّن
 * DeviceSetupPage لكن مثبّتاً على وضع المعالج (wizard) حتى لا نكرّر
 * منطق localStorage / device.json / Print Bridge / إعدادات الطابعات.
 *
 * الواجهة القديمة /device-setup ما زالت موجودة كـ "إعدادات الجهاز
 * المتقدمة" للدعم الفني.
 */
export default function NewDeviceOnboardingPage() {
  return <DeviceSetupPage variant="wizard" />;
}