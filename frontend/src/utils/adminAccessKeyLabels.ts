import type { Permission } from '@/api/admin/adminAccessKeys'

// Display-only translations: IDs, scopes and submitted policy values stay unchanged.
export const RU_ADMIN_PERMISSION_LABELS: Record<string, string> = {
  'accounts.read': 'Просмотр аккаунтов (без секретов)',
  'accounts.create': 'Создание аккаунтов',
  'accounts.update': 'Изменение названия и примечания',
  'accounts.credentials': 'Запись учётных данных (без чтения)',
  'accounts.models.write': 'Изменение разрешённых ID моделей и сопоставлений аккаунта',
  'accounts.network': 'Изменение адреса подключения, прокси и параметров соединения',
  'accounts.status': 'Включение, отключение и допуск к распределению запросов',
  'accounts.schedule': 'Изменение параллелизма, приоритета и срока действия',
  'accounts.refresh': 'Обновление учётных данных OAuth',
  'accounts.recover': 'Сброс ошибок аккаунта и состояния ограничений запросов',
  'accounts.delete': 'Удаление аккаунтов (затрагивает связанные группы)',
  'accounts.groups': 'Изменение связей с разрешёнными группами',
  'groups.models.read': 'Чтение разрешённых моделей и возможных ID выбранных групп',
  'groups.models.write': 'Изменение разрешённых моделей (затрагивает всю группу)',
  'proxies.read': 'Чтение вариантов IP прокси с пагинацией (без учётных данных)',
  'models.defaults.read': 'Чтение стандартных разрешённых ID моделей и сопоставлений',
  'dashboard.read': 'Чтение отчётов по всей системе',
  'users.read': 'Чтение данных всех пользователей, включая контакты',
  'users.balance.read': 'Чтение балансов и истории операций всех пользователей',
  'users.balance.write': 'Изменение баланса любого пользователя',
  'users.quotas.read': 'Чтение квот платформ всех пользователей',
  'users.quotas.write': 'Изменение и сброс квот платформ всех пользователей',
  'groups.read': 'Чтение настроек всех групп',
  'usage.read': 'Чтение детализации использования по всей системе и пользователям',
  'payment.read': 'Чтение всех платёжных заказов и отчётов',
  'payment.cancel': 'Отмена платёжных заказов',
  'payment.fulfill': 'Повторное выполнение платёжных заказов',
  'payment.refund': 'Запрос возврата и проверка его результата',
  'payment.plans.read': 'Чтение всех платёжных планов',
  'payment.plans.write': 'Создание, изменение и удаление платёжных планов',
  'subscriptions.read': 'Чтение всех записей подписок',
  'subscriptions.assign': 'Назначение подписок любым пользователям',
  'subscriptions.extend': 'Продление подписок',
  'subscriptions.revoke': 'Отзыв подписок',
  'subscriptions.restore': 'Восстановление подписок',
  'subscriptions.reset': 'Сброс квот подписок',
  'announcements.read': 'Чтение всех объявлений и записей о прочтении',
  'announcements.write': 'Создание, публикация и изменение объявлений',
  'announcements.delete': 'Удаление объявлений',
  'promo.read': 'Чтение промокодов и записей об использовании',
  'promo.write': 'Создание и изменение условий промокодов',
  'promo.delete': 'Удаление промокодов',
  'ops.read': 'Чтение показателей эксплуатации всей системы',
  'ops.errors.read': 'Чтение подробностей ошибок запросов всей системы (конфиденциальные данные)',
  'ops.errors.resolve': 'Изменение статуса обработки ошибок запросов',
  'ops.alerts.read': 'Чтение всех правил и событий оповещений',
  'ops.alerts.write': 'Изменение правил, статусов и периодов отключения оповещений',
  'system.read': 'Чтение версии системы и доступных обновлений',
}
const RU_CATEGORIES: Record<string, string> = {
  '账户': 'Аккаунты', '分组模型': 'Модели групп', '代理': 'Прокси', '模型': 'Модели',
  '报表': 'Отчёты', '用户': 'Пользователи', '财务': 'Финансы', '分组': 'Группы',
  '订阅': 'Подписки', '内容': 'Содержимое', '监控': 'Мониторинг', '系统': 'Система',
}
const RU_ACCOUNT_TYPES: Record<string, string> = {
  oauth: 'OAuth', 'setup-token': 'Токен настройки', apikey: 'API-ключ',
  upstream: 'Удалённый шлюз', bedrock: 'Amazon Bedrock', service_account: 'Сервисный аккаунт',
}
const isRussian = (locale?: string) => /^ru(?:[-_]|$)/i.test(locale ?? '')
export function adminAccessPermissionLabel(permission: Pick<Permission, 'id' | 'label'>, locale?: string): string {
  return isRussian(locale) ? RU_ADMIN_PERMISSION_LABELS[permission.id] ?? 'Неизвестная операция' : permission.label
}
export function adminAccessCategoryLabel(category: string, locale?: string): string {
  return isRussian(locale) ? RU_CATEGORIES[category] ?? 'Прочее' : category
}
export function adminAccessAccountTypeLabel(type: string, locale?: string): string {
  return isRussian(locale) ? RU_ACCOUNT_TYPES[type] ?? 'Неизвестный тип' : type
}
