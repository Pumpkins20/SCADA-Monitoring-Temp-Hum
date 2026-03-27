<?php

use App\Models\User;

it('redirects guests from mirror page to login', function () {
    $this->get(route('mirror.index'))->assertRedirect(route('login'));
});

it('allows authenticated verified users to visit mirror page', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('mirror.index'))
        ->assertOk()
        ->assertInertia(fn($page) => $page->component('mirror/index'));
});

it('redirects guests when testing mirror connection', function () {
    $this->postJson(route('mirror.test-connection'), [
        'ip_address' => '127.0.0.1',
        'port' => 502,
        'protocol' => 'http',
    ])->assertUnauthorized();
});

it('validates mirror connection payload', function () {
    $this->actingAs(User::factory()->create())
        ->postJson(route('mirror.test-connection'), [
            'ip_address' => 'not-ip',
            'port' => 70000,
            'protocol' => 'ftp',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['ip_address', 'port', 'protocol']);
});

it('returns mirror connection status payload', function () {
    $this->actingAs(User::factory()->create())
        ->postJson(route('mirror.test-connection'), [
            'ip_address' => '127.0.0.1',
            'port' => 9999,
            'protocol' => 'http',
        ])
        ->assertOk()
        ->assertJsonStructure([
            'success',
            'reachable',
            'latency_ms',
            'message',
        ]);
});
