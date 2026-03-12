<?php

namespace App\Services;

use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\Log;

class DssPersonService extends DssBaseService
{
    public function __construct(private DssAuthService $authService)
    {
        parent::__construct();
    }

    public function dssAddPerson(array $personData): array
    {
        try {
            if ($error = $this->ensureSettings(['base_url'])) {
                return $error;
            }

            $authResult = $this->authService->ensureAuthorized();
            if (isset($authResult['error'])) {
                return ['error' => 'Ошибка авторизации: ' . $authResult['error']];
            }

            $requiredFields = ['firstName', 'lastName', 'gender', 'iin', 'data', 'foto'];
            foreach ($requiredFields as $field) {
                if (!isset($personData[$field]) || empty($personData[$field])) {
                    return ['error' => "Отсутствует обязательное поле: {$field}"];
                }
            }

            $dssApi = $this->getApiDefinition('AddPerson');
            if (!$dssApi) {
                return ['error' => 'API метод AddPerson не найден в базе данных. Необходимо добавить запись в таблицу dss_apis.'];
            }

            $birthDate = strtotime($personData['data']);
            if ($birthDate === false) {
                return ['error' => 'Некорректный формат даты рождения. Используйте формат Y-m-d (например, 1995-12-06)'];
            }

            $facePictures = is_array($personData['foto']) ? $personData['foto'] : [$personData['foto']];
            $requestBody = [
                'baseInfo' => [
                    'personId' => $personData['iin'],
                    'firstName' => $personData['firstName'],
                    'lastName' => $personData['lastName'],
                    'gender' => (string) $personData['gender'],
                    'orgCode' => '001',
                    'source' => '0',
                    'facePictures' => $facePictures,
                ],
                'extensionInfo' => [
                    'idType' => '0',
                    'idNo' => $personData['iin'],
                    'nationalityId' => '9999',
                ],
                'authenticationInfo' => [
                    'startTime' => (string) $birthDate,
                    'endTime' => '2000000000',
                ],
                'accessInfo' => [
                    'accessType' => '0',
                ],
                'faceComparisonInfo' => [
                    'enableFaceComparisonGroup' => '1',
                ],
                'entranceInfo' => [
                    'parkingSpaceQuotas' => [],
                    'vehicles' => [],
                ],
            ];

            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => $requestBody,
            ]);

            if ($response->getStatusCode() !== 200 || !$response->getBody()) {
                return ['error' => 'Ошибка HTTP запроса: ' . $response->getStatusCode()];
            }

            $responseData = json_decode($response->getBody(), true);
            if ((int) ($responseData['code'] ?? 0) === 1000) {
                Log::info('Пользователь успешно добавлен в DSS', [
                    'personId' => $personData['iin'],
                    'firstName' => $personData['firstName'],
                    'lastName' => $personData['lastName'],
                ]);

                return [
                    'success' => true,
                    'message' => 'Пользователь успешно добавлен в DSS',
                    'data' => $responseData['data'] ?? null,
                ];
            }

            Log::error('Ошибка добавления пользователя в DSS', [
                'code' => $responseData['code'] ?? 'unknown',
                'message' => $responseData['message'] ?? 'unknown',
                'response' => $responseData,
            ]);

            return [
                'error' => 'Ошибка DSS API',
                'code' => $responseData['code'] ?? 'unknown',
                'message' => $responseData['message'] ?? 'Неизвестная ошибка',
                'data' => $responseData,
            ];
        } catch (RequestException $exception) {
            Log::error('Исключение при добавлении пользователя в DSS', [
                'error' => $exception->getMessage(),
                'trace' => $exception->getTraceAsString(),
            ]);

            if ($exception->hasResponse()) {
                return [
                    'error' => 'Ошибка запроса к DSS',
                    'message' => $exception->getMessage(),
                    'response' => json_decode($exception->getResponse()->getBody(), true),
                ];
            }

            return ['error' => 'Ошибка соединения с DSS: ' . $exception->getMessage()];
        } catch (\Exception $exception) {
            Log::error('Общая ошибка при добавлении пользователя в DSS', [
                'error' => $exception->getMessage(),
                'trace' => $exception->getTraceAsString(),
            ]);

            return ['error' => 'Внутренняя ошибка: ' . $exception->getMessage()];
        }
    }
}