export const T = {
  en: {
    dashboard: 'Dashboard', stores: 'Stores', workOrders: 'Work Orders',
    ppmSchedule: 'PPM Schedule', mySchedule: 'My Schedule', analytics: 'Analytics',
    usersAccess: 'Users & Access', signOut: 'Sign out',
    goodMorning: 'Good morning', goodAfternoon: 'Good afternoon', goodEvening: 'Good evening',
    totalWorkOrders: 'Total Work Orders', open: 'Open', inProgress: 'In Progress',
    assets: 'Assets', ppmDue: 'PPM Due (7 days)', closedToday: 'Closed Today',
    newWorkOrder: '+ New Work Order', schedulePPM: '+ Schedule PPM',
    recentWorkOrders: 'Recent Work Orders', noWorkOrders: 'No work orders yet. Create your first one!',
    priority: 'Priority', title: 'Title', store: 'Store', status: 'Status', sla: 'SLA',
    signIn: 'Sign in to your account', emailAddress: 'Email address', password: 'Password',
    forgotPassword: 'Forgot password?', signingIn: 'Signing in...', admin: 'Admin',
    technician: 'Technician', operations: 'Operations',
  },
  ar: {
    dashboard: 'لوحة التحكم', stores: 'الفروع', workOrders: 'أوامر العمل',
    ppmSchedule: 'جدول الصيانة', mySchedule: 'جدولي', analytics: 'التحليلات',
    usersAccess: 'المستخدمون والصلاحيات', signOut: 'تسجيل الخروج',
    goodMorning: 'صباح الخير', goodAfternoon: 'مساء الخير', goodEvening: 'مساء الخير',
    totalWorkOrders: 'إجمالي أوامر العمل', open: 'مفتوح', inProgress: 'قيد التنفيذ',
    assets: 'الأصول', ppmDue: 'صيانة مستحقة (7 أيام)', closedToday: 'مغلق اليوم',
    newWorkOrder: '+ أمر عمل جديد', schedulePPM: '+ جدولة صيانة',
    recentWorkOrders: 'أوامر العمل الأخيرة', noWorkOrders: 'لا توجد أوامر عمل بعد.',
    priority: 'الأولوية', title: 'العنوان', store: 'الفرع', status: 'الحالة', sla: 'مستوى الخدمة',
    signIn: 'تسجيل الدخول', emailAddress: 'البريد الإلكتروني', password: 'كلمة المرور',
    forgotPassword: 'نسيت كلمة المرور؟', signingIn: 'جارٍ الدخول...', admin: 'مدير',
    technician: 'فني', operations: 'عمليات',
  },
  ur: {
    dashboard: 'ڈیش بورڈ', stores: 'اسٹور', workOrders: 'کام کے آرڈر',
    ppmSchedule: 'PPM شیڈول', mySchedule: 'میرا شیڈول', analytics: 'تجزیات',
    usersAccess: 'صارفین اور رسائی', signOut: 'سائن آؤٹ',
    goodMorning: 'صبح بخیر', goodAfternoon: 'دوپہر بخیر', goodEvening: 'شام بخیر',
    totalWorkOrders: 'کل کام کے آرڈر', open: 'کھلا', inProgress: 'جاری',
    assets: 'اثاثے', ppmDue: 'PPM واجب (7 دن)', closedToday: 'آج بند',
    newWorkOrder: '+ نیا آرڈر', schedulePPM: '+ PPM شیڈول',
    recentWorkOrders: 'حالیہ کام کے آرڈر', noWorkOrders: 'ابھی تک کوئی آرڈر نہیں۔',
    priority: 'ترجیح', title: 'عنوان', store: 'اسٹور', status: 'حالت', sla: 'SLA',
    signIn: 'سائن ان کریں', emailAddress: 'ای میل پتہ', password: 'پاس ورڈ',
    forgotPassword: 'پاس ورڈ بھول گئے؟', signingIn: 'سائن ان ہو رہا ہے...', admin: 'ایڈمن',
    technician: 'ٹیکنیشن', operations: 'آپریشنز',
  }
}

export function t(lang, key) {
  return T[lang]?.[key] || T['en'][key] || key
}
