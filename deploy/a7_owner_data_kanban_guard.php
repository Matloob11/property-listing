<?php
/**
 * Owner Data (SPA 1042) kanban fatals on PHP 8 when a saved filter has STAGE_ID as a string:
 * TypeError: Bitrix\Crm\Kanban::$allowStages must be array.
 * Send those users to the list view instead. Safe if already loaded.
 */
declare(strict_types=1);

if (!function_exists('a7_owner_data_kanban_guard')) {
    function a7_owner_data_kanban_guard(): void
    {
        $uri = (string)($_SERVER['REQUEST_URI'] ?? '');
        if (!preg_match('#/crm/type/1042/kanban(/|\\?|$)#', $uri)) {
            return;
        }
        $query = (string)(parse_url($uri, PHP_URL_QUERY) ?: '');
        parse_str($query, $params);
        if (!is_array($params)) {
            $params = [];
        }
        $params['apply_filter'] = 'Y';
        $target = '/crm/type/1042/list/category/14/?' . http_build_query($params);
        LocalRedirect($target);
    }
}

AddEventHandler('main', 'OnPageStart', 'a7_owner_data_kanban_guard');
